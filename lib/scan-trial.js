"use strict";
// Mounted after the ordinary scan teacher authentication. Trial requests never
// create records, write images, or publish grades to Google Sheets.
const multer = require("multer");
const { bad } = require("./scan-store");
const assess = require("./scan-assess");
function validateConfig(value) {
  if (!value || !Array.isArray(value.key) || value.key.length !== 20 || value.key.some(a=>!/^[ABCD]$/.test(a)))
    throw bad("Bản VietOCR hiện hỗ trợ đúng 20 câu trắc nghiệm A–D.");
  const point = value.point;
  if (typeof point!=="number" || !Number.isFinite(point) || point<=0 || point>.5)
    throw bad("Điểm mỗi câu TN phải lớn hơn 0, tối đa 0,5.");
  if(!Array.isArray(value.rubrics)||value.rubrics.length!==2)throw bad("Thiếu thang điểm tự luận.");
  const rubrics=value.rubrics.map(ideas=>{
    if(!Array.isArray(ideas)||ideas.length>30)throw bad("Mỗi câu tự luận tối đa 30 ý.");
    return ideas.map(x=>{
      if(!x || typeof x.text!=="string" || !x.text.trim() || x.text.length>2000 || typeof x.points!=="number" || !Number.isFinite(x.points) || x.points<=0 || x.points>10)throw bad("Nội dung hoặc điểm từng ý không hợp lệ.");
      return {text:x.text.trim(),points:x.points};
    });
  });
  if(20*point+rubrics.flat().reduce((s,x)=>s+x.points,0)>10.000001)throw bad("Tổng thang điểm không được vượt 10.");
  return {key:value.key,point,rubrics};
}
module.exports=function mountTrial(router,{env,fetcher,wrap}) {
  let working=false;
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:12*1024*1024,files:2,fields:1,fieldSize:150000}}).array("pages",2);
  router.post("/trial/recognize",(req,res,next)=>{
    if(working)return next(bad("Bộ chấm thử đang xử lý một bài khác. Chờ hoàn tất rồi thử lại.",429));
    if(!env.SCAN_OCR_URL||!env.SCAN_OCR_TOKEN)return next(bad("Chưa cấu hình VietOCR trên VPS (SCAN_OCR_URL và SCAN_OCR_TOKEN).",503));
    working=true;
    let released=false;
    const release=()=>{if(!released){working=false;released=true;}};
    res.once("finish",release);
    res.once("close",()=>{if(!req.trialInference)release();});
    // Do not release on client disconnect while inference is still running.
    req.releaseTrial=release;
    upload(req,res,error=>{if(error)release();next(error);});
  },wrap(async(req,res)=>{
    try {
      let raw;
      try{raw=JSON.parse(req.body.configuration);}catch{throw bad("Cấu hình đáp án không hợp lệ.");}
      const c=validateConfig(raw),files=req.files;
      if(!files?.length || files.length>2)throw bad("Mỗi bài cần 1 hoặc 2 ảnh.");
      for(const f of files){
        const jpeg=f.buffer.subarray(0,3).equals(Buffer.from([255,216,255]));
        const png=f.buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
        if(!jpeg&&!png)throw bad("Chỉ nhận ảnh JPEG hoặc PNG.");
      }
      req.trialInference=true;
      let response;
      try {
        response=await fetcher(env.SCAN_OCR_URL.replace(/\/$/,"")+"/recognize",{
          method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+env.SCAN_OCR_TOKEN},
          signal:AbortSignal.timeout(300000),
          body:JSON.stringify({pages:files.map(f=>f.buffer.toString("base64")),layout:{}})
        });
      }catch{throw bad("Không kết nối được VietOCR hoặc xử lý quá lâu. Kiểm tra dịch vụ Python trên VPS.",502);}
      if(!response.ok)throw bad("VietOCR trả lỗi "+response.status+". Kiểm tra dịch vụ Python rồi thử lại.",502);
      let data;
      try{data=await response.json();}catch{throw bad("VietOCR không trả kết quả hợp lệ.",502);}
      if(!data?.fields || typeof data.fields!=="object" || Array.isArray(data.fields))throw bad("VietOCR thiếu dữ liệu nhận diện.",502);
      const exam={key:c.key,quizPoint:c.point,essays:c.rubrics.map(ideas=>({ideas}))};
      const marks=assess(exam,data), fields=data.fields;
      res.json({success:true,engine:String(data.engine||"VietOCR"),
        quiz:c.key.map((_,i)=>{
          const f=fields["q"+(i+1)]||{},a=String(f.text||"").trim().toUpperCase();
          return {number:i+1,answer:/^[ABCD]$/.test(a)?a:"",uncertain:true,note:String(f.reason||(/^[ABCD]$/.test(a)?"VietOCR đề xuất, cần đối chiếu ảnh.":"Chưa đọc rõ, không tự gán 0 điểm."))};
        }),
        essays:c.rubrics.map((ideas,i)=>({number:i+1,text:String(fields["essay"+(i+1)]?.text||""),
          ideas:ideas.map((idea,j)=>({index:j+1,
            // Composite rubric scores cannot safely be split into idea scores.
            score:marks.essays[i]?.method==="exact_complete_answer"?idea.points:null,
            reason:marks.essays[i]?.method==="exact_complete_answer"?"Bản đọc trùng nội dung chuẩn, cần GV đối chiếu.":"VietOCR chỉ đọc chữ. GV kiểm tra và cho điểm từng ý."}))}))});
    }finally{req.releaseTrial();}
  }));
};
module.exports.validateConfig=validateConfig;
