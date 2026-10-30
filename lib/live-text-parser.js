'use strict';
// Plain text format: Câu 1: ... / A. ... / B. ... / C. ... / D. ... / Đáp án: B
function parse(input){
 const text=String(input||'').replace(/\r/g,'').trim();
 if(!text||text.length>350000)throw Error('Nội dung trống hoặc quá dài (tối đa 350.000 ký tự).');
 const blocks=text.split(/(?=^\s*Câu\s+\d+\s*[:.])/gim).map(x=>x.trim()).filter(Boolean);
 if(!blocks.length||blocks.length>200)throw Error('Cần 1–200 câu hỏi, bắt đầu bằng "Câu 1:".');
 return blocks.map((block,index)=>{
  const lines=block.split('\n').map(x=>x.trim()).filter(Boolean);
  const first=lines.shift(),match=first.match(/^Câu\s+(\d+)\s*[:.]\s*(.*)$/i);
  if(!match||Number(match[1])!==index+1)throw Error('Số câu phải liên tục từ Câu 1 (lỗi câu '+(index+1)+').');
  let q=match[2],opts=[],answer=null,stage=0;
  for(const line of lines){
   const a=line.match(/^([ABCD])\s*[.)][:]?\s*(.*)$/i);
   const key=line.match(/^(?:Đáp\s*án(?:\s*đúng)?|DA|Answer)\s*[:：]\s*([ABCD])\s*$/i);
   if(key){if(stage!==4||answer!==null)throw Error('Sai vị trí đáp án tại câu '+(index+1));answer=key[1].toUpperCase().charCodeAt(0)-65;continue}
   if(a){if(answer!==null||a[1].toUpperCase()!=='ABCD'[stage]||!a[2].trim())throw Error('Phương án A–D không đúng tại câu '+(index+1));opts.push(a[2].trim());stage++;continue}
   if(stage===0&&answer===null)q+=' '+line;else throw Error('Dòng không hợp lệ tại câu '+(index+1)+': '+line.slice(0,60));
  }
  if(!q.trim()||q.length>3000||opts.length!==4||opts.some(o=>o.length>1500)||answer===null)throw Error('Câu '+(index+1)+' thiếu nội dung, A–D hoặc Đáp án: A/B/C/D.');
  return {q:q.trim(),o:opts,a:answer};
 });
}
module.exports={parse};
