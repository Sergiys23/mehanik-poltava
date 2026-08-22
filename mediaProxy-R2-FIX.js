async function mediaProxy(req,e,id){
  const row=await e.DB.prepare(`SELECT id,drive_id,name,mime_type,size_bytes FROM drive_media WHERE id=?`).bind(id).first();
  if(!row)return new Response("Media not found",{status:404,headers:base});

  const total=Number(row.size_bytes||0);
  const type=String(row.mime_type||"application/octet-stream");
  const filename=encodeURIComponent(row.name||id);

  const common=()=>{
    const h=new Headers();
    h.set("content-type",type);
    h.set("accept-ranges","bytes");
    h.set("cache-control","public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400");
    h.set("content-disposition",`inline; filename*=UTF-8''${filename}`);
    h.set("x-content-type-options","nosniff");
    return h;
  };

  if(e.MEDIA){
    try{
      const rangeHeader=req.headers.get("range");

      if(req.method==="HEAD"){
        const h=common();
        h.set("content-length",String(total));
        return new Response(null,{status:200,headers:h});
      }

      if(rangeHeader){
        const m=rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
        if(!m)return new Response("Invalid Range",{
          status:416,
          headers:{"content-range":`bytes */${total}`}
        });

        let start,end,length;

        if(m[1]===""){
          const suffix=Number(m[2]);
          if(!Number.isFinite(suffix)||suffix<=0){
            return new Response("Invalid Range",{
              status:416,
              headers:{"content-range":`bytes */${total}`}
            });
          }
          length=Math.min(suffix,total);
          start=Math.max(0,total-length);
          end=total-1;
        }else{
          start=Number(m[1]);
          end=m[2]==="" ? total-1 : Number(m[2]);

          if(!Number.isFinite(start)||!Number.isFinite(end)||
             start<0||start>=total||end<start){
            return new Response("Range Not Satisfiable",{
              status:416,
              headers:{"content-range":`bytes */${total}`}
            });
          }

          end=Math.min(end,total-1);
          length=end-start+1;
        }

        const obj=await e.MEDIA.get(`media/${id}`,{
          range:{offset:start,length}
        });

        if(!obj||!obj.body){
          return new Response("Media not found",{status:404,headers:base});
        }

        const actualStart=Number(obj.range?.offset ?? start);
        const actualLength=Number(obj.range?.length ?? length);
        const actualEnd=actualStart+actualLength-1;

        const h=common();
        h.set("content-length",String(actualLength));
        h.set("content-range",`bytes ${actualStart}-${actualEnd}/${total}`);

        if(obj.httpEtag)h.set("etag",obj.httpEtag);

        return new Response(obj.body,{
          status:206,
          headers:h
        });
      }

      const obj=await e.MEDIA.get(`media/${id}`);

      if(obj&&obj.body){
        const h=common();
        h.set("content-length",String(total||obj.size));
        if(obj.httpEtag)h.set("etag",obj.httpEtag);

        return new Response(obj.body,{
          status:200,
          headers:h
        });
      }
    }catch(err){
      console.log("R2 media read failed",String(err?.message||err));
    }
  }

  const driveId=String(row.drive_id||"");
  if(!driveId){
    return new Response("Media unavailable",{status:502,headers:base});
  }

  try{
    const token=await googleAccessToken(e);
    const headers={Authorization:`Bearer ${token}`};

    const range=req.headers.get("range");
    if(range)headers.Range=range;

    const r=await fetch(
      `${GOOGLE_DRIVE_API}/files/${encodeURIComponent(driveId)}?alt=media`,
      {method:"GET",headers}
    );

    if(!r.ok){
      return new Response("Media unavailable",{
        status:r.status,
        headers:base
      });
    }

    const h=common();
    h.set("cache-control","private, no-store");

    const cr=r.headers.get("content-range");
    const cl=r.headers.get("content-length");

    if(cr)h.set("content-range",cr);
    if(cl)h.set("content-length",cl);

    return new Response(
      req.method==="HEAD" ? null : r.body,
      {status:r.status,headers:h}
    );
  }catch(err){
    return new Response("Media unavailable",{
      status:502,
      headers:base
    });
  }
}
