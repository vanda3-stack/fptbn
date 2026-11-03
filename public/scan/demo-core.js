"use strict";
(function(root) {
  const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
  function parseKey(text) {
    text = String(text).trim().toUpperCase();
    if (/^[ABCD\s,;|]+$/.test(text)) {
      const a = text.replace(/[\s,;|]/g, "").split("");
      if (a.length && a.length <= 100) return a;
    }
    const pairs = [...text.matchAll(/(?:CÂU\s*)?(\d+)\s*[.):=\-]?\s*([ABCD])(?=$|[\s,;|])/g)];
    if (!pairs.length) throw Error("Nhập đáp án dạng 1.A 2.B 3.C hoặc A B C D.");
    // Reject unparsed text instead of silently accepting only part of a pasted key.
    const rest = text.replace(/(?:CÂU\s*)?(\d+)\s*[.):=\-]?\s*([ABCD])(?=$|[\s,;|])/g, "").replace(/[\s,;|]/g, "");
    if (rest) throw Error("Chỉ dán phần đáp án trắc nghiệm; kiểm tra ký tự còn thừa.");
    const map = new Map();
    for (const p of pairs) {
      const n = +p[1];
      if (n < 1 || n > 100 || map.has(n)) throw Error("Số câu trùng hoặc ngoài khoảng 1–100.");
      map.set(n, p[2]);
    }
    const a = [];
    for (let n = 1; n <= map.size; n++) {
      if (!map.has(n)) throw Error("Đáp án thiếu câu " + n + ".");
      a.push(map.get(n));
    }
    return a;
  }
  function rubric(text) {
    if (!text.trim()) return [];
    return text.trim().split(/\n/).filter(x=>x.trim()).map(line => {
      const i = line.lastIndexOf("|");
      const content = line.slice(0,i).trim(), points = Number(line.slice(i+1).trim().replace(",","."));
      if (i < 1 || !content || !Number.isFinite(points) || points <= 0 || points > 10) throw Error("Mỗi ý tự luận nhập: Nội dung ý | điểm (ví dụ 0,5).");
      return {text:content,points};
    });
  }
  function normalize(data, count, rubrics) {
    if (!data || !Array.isArray(data.quiz)) throw Error("AI chưa trả danh sách câu trả lời hợp lệ. Thử lại với ảnh rõ hơn.");
    const quiz = Array.from({length:count}, (_,i) => {
      const found = data.quiz.filter(x=>x && x.number === i+1), r = found[0];
      const valid = found.length === 1 && ["A","B","C","D","BLANK","MULTIPLE"].includes(r?.answer);
      return {number:i+1,answer:valid?r.answer:"",uncertain:!valid || r.uncertain !== false,note:String(r?.note || "").slice(0,500)};
    });
    const essays = rubrics.map((ideas,i)=> {
      const found = Array.isArray(data.essays) ? data.essays.filter(x=>x?.number===i+1) : [];
      const e = found.length===1?found[0]:null;
      return {text:String(e?.text||""),scores:ideas.map((idea,j)=> {
        const matches = Array.isArray(e?.ideas)?e.ideas.filter(x=>x?.index===j+1):[];
        const x = matches.length===1?matches[0]:null;
        return {score:typeof x?.score==="number" && Number.isFinite(x.score) && x.score>=0 && x.score<=idea.points ? round(x.score):null,reason:String(x?.reason||"Cần kiểm tra")};
      })};
    });
    return {quiz,essays};
  }
  function score(key, point, result) {
    if (!Number.isFinite(point) || point<=0) throw Error("Điểm mỗi câu phải lớn hơn 0.");
    let total=0, pending=0, correct=0;
    result.quiz.forEach((r,i)=> {
      if(r.uncertain || !r.answer) pending++;
      else if(r.answer===key[i]) {total+=point;correct++;}
    });
    result.essays.forEach(e=>e.scores.forEach(x=> {if(x.score===null) pending++;else total+=x.score;}));
    return {total:round(total),pending,correct};
  }
  function csv(rows) {
    const cell = v => '"'+String(v).replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
    return '\uFEFF'+[["Mã phách","Điểm chấm thử"],...rows.map(r=>[r.code,r.score])].map(r=>r.map(cell).join(",")).join("\r\n");
  }
  const api={parseKey,rubric,normalize,score,csv,round};
  if(typeof module!=="undefined" && module.exports) module.exports=api; else root.ScanDemo=api;
})(typeof window!=="undefined"?window:this);
