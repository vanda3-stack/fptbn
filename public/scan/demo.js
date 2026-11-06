"use strict";
(() => {
  const $ = s=>document.querySelector(s), C=window.ScanDemo;
  const esc = s=>String(s??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let config=null, pages=[null,null], stream=null, result=null, rows=[], busy=false, source="", saved=false;
  let token=sessionStorage.getItem('ot-teacher-token')||'';
  function message(s) {$('#toast').textContent=s;$('#toast').hidden=false;clearTimeout(message.timer);message.timer=setTimeout(()=>$('#toast').hidden=true,9000);}
  function run(fn) {return async(...a)=>{try{await fn(...a);}catch(e){message(e.message);}};}
  function freeze(on) {
    busy=on;
    document.querySelectorAll('button,input,textarea,select').forEach(x=>x.disabled=on);
    if(!on) $('#export').disabled=!rows.length;
  }
  function showLogin() {
    stop();$('#workspace').hidden=true;$('#loginPanel').hidden=false;
  }
  async function api(path,body) {
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),310000);
    try{
      const response=await fetch('/api/scan'+path,{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:'Bearer '+token},body,signal:ctl.signal});
      let d;try{d=await response.json();}catch{throw Error('Máy chủ chưa trả dữ liệu hợp lệ. Cần cập nhật mã và khởi động lại NodeJS.');}
      if(!response.ok){
        if(response.status===401){token='';sessionStorage.removeItem('ot-teacher-token');showLogin();}
        throw Error(d.message||'Không xử lý được yêu cầu.');
      }
      return d;
    }catch(e){
      if(e.name==='AbortError')throw Error('VietOCR xử lý quá lâu. Ảnh vẫn giữ, kiểm tra dịch vụ Python rồi thử lại.');
      if(e instanceof TypeError)throw Error('Không kết nối được máy chủ FPTBN. Kiểm tra mạng rồi thử lại.');
      throw e;
    }finally{clearTimeout(timer);}
  }
  async function checkOCR(){
    $('#connection').textContent='Đang kiểm tra VietOCR trên VPS…';
    const d=await api('/status');
    if(!d.capabilities?.trial){$('#connection').textContent='Máy chủ chưa nạp bản demo VietOCR mới. Cập nhật mã và khởi động lại NodeJS.';throw Error($('#connection').textContent);}
    $('#connection').textContent=d.ocr?.ready?'Đã kết nối VietOCR. Sẵn sàng chấm thử bài thật.':d.ocr?.configured?'Đã cấu hình nhưng VietOCR chưa sẵn sàng. Kiểm tra dịch vụ Python trên VPS.':'Chưa cấu hình VietOCR trên VPS. Cần SCAN_OCR_URL và SCAN_OCR_TOKEN.';
    return d;
  }
  $('#connect').onclick=run(async()=>{freeze(true);try{await checkOCR();}finally{freeze(false);$('#settings').disabled=!!result;}});
  $('#loginForm').onsubmit=async e=>{
    e.preventDefault();const button=e.submitter;button.disabled=true;$('#loginError').textContent='';
    try{
      const response=await fetch('/api/teacher/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('#email').value,password:$('#password').value})});
      const d=await response.json();if(!response.ok||!d.success)throw Error(d.message||'Đăng nhập thất bại.');
      token=d.token;sessionStorage.setItem('ot-teacher-token',token);sessionStorage.setItem('ot-teacher-name',d.teacher.full_name);$('#password').value='';
      $('#loginPanel').hidden=true;$('#workspace').hidden=false;await checkOCR();
    }catch(error){$('#loginError').textContent=error.message;}finally{button.disabled=false;}
  };
  $('#importDoc').onclick=run(async()=>{
    freeze(true);
    try{
      const response=await fetch('/api/scan/import-doc',{method:'POST',cache:'no-store',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({url:$('#docLink').value.trim()})});
      const d=await response.json();if(!response.ok){if(response.status===401)showLogin();throw Error(d.message||'Không đọc được tài liệu.');}
      if(!d.key?.every(x=>/^[ABCD]$/.test(x)))throw Error('Tài liệu chưa có đủ 20 đáp án A–D. Kiểm tra và nhập lại.');
      $('#answerKey').value=d.key.map((x,i)=>(i+1)+'.'+x).join(' ');
      d.essays.forEach((e,i)=>$('#rubric'+(i+1)).value=e.ideas.map(x=>x.text+' | '+x.points).join('\n'));
      config=null;$('#keyStatus').textContent='Đã đọc tài liệu. Kiểm tra đáp án, thang điểm và bấm Xác nhận đáp án.';
    }finally{freeze(false);$('#settings').disabled=!!result;}
  });
  $('#openDoc').onclick=run(()=>{
    const u=new URL($('#docLink').value);
    if(u.protocol!=='https:'||u.hostname!=='docs.google.com'||!/^\/document\/d\/[\w-]+/.test(u.pathname)||u.username||u.password)throw Error('Nhập link Google Docs hợp lệ.');
    window.open(u.href,'_blank','noopener,noreferrer');
  });
  function prepare() {
    const key=C.parseKey($('#answerKey').value), point=Number($('#point').value), rubrics=[C.rubric($('#rubric1').value),C.rubric($('#rubric2').value)];
    if(key.length!==20)throw Error('Bộ VietOCR hiện hỗ trợ đúng 20 câu TN. Nhập đủ 20 đáp án.');
    if(!Number.isFinite(point)||point<=0||point>.5)throw Error('Điểm mỗi câu phải lớn hơn 0, tối đa 0,5.');
    const max=C.round(key.length*point+rubrics.flat().reduce((s,x)=>s+x.points,0));
    if(max>10) throw Error('Tổng thang điểm đang là '+max+'. Điều chỉnh để không vượt quá 10.');
    config={key,point,rubrics,max};
    $('#keyStatus').textContent=`Đã xác nhận ${key.length} câu TN · ${rubrics.filter(r=>r.length).length} câu TL · Tối đa ${max} điểm.`;
    return config;
  }
  $('#prepare').onclick=run(prepare);
  for(const id of ['answerKey','point','rubric1','rubric2']) $('#'+id).oninput=()=>{
    config=null;$('#keyStatus').textContent='Đáp án đã thay đổi. Cần xác nhận lại trước khi chấm.';
    if(result){result=null;$('#result').hidden=true;$('#settings').disabled=false;}
  };
  function stop() {stream?.getTracks().forEach(t=>t.stop());stream=null;$('#cameraBox').hidden=true;$('#cameraOff').hidden=true;$('#cameraOn').hidden=false;}
  $('#cameraOff').onclick=stop;
  $('#cameraOn').onclick=run(async()=>{
    if(!navigator.mediaDevices?.getUserMedia)throw Error('Trình duyệt không mở được camera. Dùng nút Chụp / tải mặt 1.');
    try {stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:2400},height:{ideal:1800}},audio:false});}
    catch {throw Error('Chưa mở được camera. Cho phép quyền camera hoặc dùng nút Chụp / tải ảnh.');}
    $('#video').srcObject=stream;$('#cameraBox').hidden=false;$('#cameraOff').hidden=false;$('#cameraOn').hidden=true;
    await $('#video').play();
  });
  async function setPage(n,data) {
    if(result && !confirm('Thay ảnh sẽ bỏ kết quả đang đối chiếu. Tiếp tục?'))return;
    pages[n]=data;const img=$('#preview'+(n+1));img.src=data||'';img.hidden=!data;$('#remove'+(n+1)).hidden=!data;
    result=null;saved=false;$('#result').hidden=true;$('#settings').disabled=false;
  }
  for(let n=0;n<2;n++) {
    $('#file'+(n+1)).onchange=run(async e=>{
      const file=e.target.files[0];if(!file)return;
      if(file.size>25*1024*1024)throw Error('Ảnh quá lớn, tối đa 25 MB.');
      const url=URL.createObjectURL(file),img=new Image();
      try{
        await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Không đọc được ảnh. Chọn JPG/PNG hoặc chụp lại bằng camera.'));img.src=url;});
        const scale=Math.min(1,2400/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
        await setPage(n,canvas.toDataURL('image/jpeg',.9));
      }finally{URL.revokeObjectURL(url);e.target.value='';}
    });
    $('#remove'+(n+1)).onclick=run(()=>setPage(n,null));
    $('#snap'+(n+1)).onclick=run(async()=>{
      const v=$('#video');if(!v.videoWidth)throw Error('Camera chưa sẵn sàng.');
      const c=document.createElement('canvas'),s=Math.min(1,2400/Math.max(v.videoWidth,v.videoHeight));c.width=Math.round(v.videoWidth*s);c.height=Math.round(v.videoHeight*s);c.getContext('2d').drawImage(v,0,0,c.width,c.height);await setPage(n,c.toDataURL('image/jpeg',.9));stop();
    });
  }
  function check() {
    const code=$('#code').value.trim().toUpperCase();
    if(!/^[A-Z0-9_-]{1,40}$/.test(code))throw Error('Nhập mã phách gồm chữ, số, gạch ngang hoặc gạch dưới.');
    if(rows.some(r=>r.code===code))throw Error('Mã phách đã lưu trong phiên thử. Nhập mã khác.');
    $('#code').value=code;prepare();
  }
  $('#grade').onclick=run(async()=>{
    if(result&&!saved&&!confirm('Bỏ kết quả đang đối chiếu để chấm lại?'))return;
    check();if(!pages[0])throw Error('Chụp hoặc tải ảnh mặt 1 trước khi chấm.');
    stop();freeze(true);$('#progress').textContent='Đang đọc chữ viết và đối chiếu thang điểm… Giữ trang mở.';
    try {
      const state=await checkOCR();
      if(!state.ocr?.ready)throw Error($('#connection').textContent);
      const form=new FormData();form.append('configuration',JSON.stringify(config));
      for(let i=0;i<pages.length;i++)if(pages[i]){
        const blob=await(await fetch(pages[i])).blob();form.append('pages',blob,'mat-'+(i+1)+'.jpg');
      }
      const data=await api('/trial/recognize',form);
      result=C.normalize(data,config.key.length,config.rubrics);source='Nhận diện bằng '+data.engine+' trên máy chủ · cần thầy đối chiếu';saved=false;renderResult();$('#progress').textContent='Đã chấm thử. Kết quả dừng tại đây để thầy đối chiếu.';
    } catch(e){$('#progress').textContent=e.message;throw e;}finally{freeze(false);$('#settings').disabled=!!result;}
  });
  $('#manual').onclick=run(()=>{
    if(result&&!saved&&!confirm('Bỏ kết quả đang đối chiếu để nhập thủ công?'))return;
    check();result=C.normalize({quiz:[]},config.key.length,config.rubrics);source='Nhập thủ công · chỉ thử tính điểm, chưa kiểm tra nhận diện ảnh';saved=false;stop();renderResult();$('#settings').disabled=true;
  });
  function scoreView() {
    const s=C.score(config.key,config.point,result);
    $('#score').textContent=`${s.pending?'Điểm tạm tính':'Điểm đề xuất'}: ${s.total} / ${config.max} · ${s.correct}/${config.key.length} câu TN đúng${s.pending?' · '+s.pending+' mục cần kiểm tra':''}`;
    result.quiz.forEach((r,i)=>{
      const tr=$('#quizRows').children[i];tr.className=r.uncertain?'pending':'';
      const td=tr.lastElementChild;td.textContent=r.uncertain?'Cần kiểm tra':r.answer===config.key[i]?'Đúng':'Sai / không có đáp án';td.className=r.uncertain?'':r.answer===config.key[i]?'correct':'wrong';
    });
    $('#verified').checked=false;saved=false;
  }
  function renderResult() {
    $('#result').hidden=false;$('#resultMode').textContent=source;
    $('#quizRows').innerHTML=result.quiz.map((r,i)=>`<tr><td>${i+1}</td><td>${config.key[i]}</td><td><select aria-label="HS câu ${i+1}" data-q="${i}">${[['','Chưa rõ'],['A','A'],['B','B'],['C','C'],['D','D'],['BLANK','Bỏ trống'],['MULTIPLE','Nhiều đáp án']].map(([v,l])=>`<option value="${v}" ${v===r.answer?'selected':''}>${l}</option>`).join('')}</select>${r.uncertain&&r.answer?`<button type="button" data-confirm="${i}">Xác nhận đã đọc đúng</button>`:''}<div class="help">${esc(r.note)}</div></td><td></td></tr>`).join('');
    document.querySelectorAll('[data-q]').forEach(el=>el.onchange=()=>{const r=result.quiz[+el.dataset.q];r.answer=el.value;r.uncertain=!el.value;const b=el.parentElement.querySelector('button');if(b)b.hidden=true;scoreView();});
    document.querySelectorAll('[data-confirm]').forEach(el=>el.onclick=()=>{result.quiz[+el.dataset.confirm].uncertain=false;el.hidden=true;scoreView();});
    $('#essayRows').innerHTML=result.essays.map((e,i)=>config.rubrics[i].length?`<h3>Tự luận ${i+1}</h3><p style="white-space:pre-wrap">${esc(e.text||'Chưa có bản đọc bài làm.')}</p>${e.scores.map((x,j)=>`<label>${esc(config.rubrics[i][j].text)} (tối đa ${config.rubrics[i][j].points})<input class="essay-score" aria-label="Điểm TL ${i+1} ý ${j+1}" data-e="${i}" data-idea="${j}" type="number" min="0" max="${config.rubrics[i][j].points}" step="0.01" value="${x.score??''}"><span class="help">${esc(x.reason)}</span></label>`).join('')}`:'').join('');
    document.querySelectorAll('[data-e]').forEach(el=>el.oninput=()=>{const i=+el.dataset.e,j=+el.dataset.idea,n=Number(el.value);result.essays[i].scores[j].score=el.value.trim()!==''&&Number.isFinite(n)&&n>=0&&n<=config.rubrics[i][j].points?n:null;scoreView();});
    scoreView();$('#result').scrollIntoView({behavior:'smooth',block:'start'});
  }
  $('#save').onclick=run(()=>{
    if(!result)throw Error('Chưa có kết quả.');
    const s=C.score(config.key,config.point,result);if(s.pending)throw Error('Còn '+s.pending+' mục chưa rõ. Kiểm tra và sửa/xác nhận trước khi lưu.');
    if(!$('#verified').checked)throw Error('Tích xác nhận đã đối chiếu bài làm trước khi lưu.');
    const code=$('#code').value.trim().toUpperCase();if(!/^[A-Z0-9_-]{1,40}$/.test(code))throw Error('Mã phách không hợp lệ.');
    if(rows.some(r=>r.code===code))throw Error('Mã phách đã có điểm. Không ghi trùng.');
    rows.push({code,score:s.total});saved=true;$('#savedCount').textContent='('+rows.length+')';$('#export').disabled=false;
    $('#savedRows').innerHTML='<table><thead><tr><th>Mã phách</th><th>Điểm chấm thử</th></tr></thead><tbody>'+rows.map(r=>`<tr><td>${esc(r.code)}</td><td>${r.score}</td></tr>`).join('')+'</tbody></table>';message('Đã lưu điểm thử trong tab này. Bấm Quét bài tiếp theo khi sẵn sàng.');
  });
  $('#next').onclick=()=>{
    if(result&&!saved&&!confirm('Bài này chưa lưu điểm thử. Bỏ kết quả để quét bài tiếp?'))return;
    stop();pages=[null,null];result=null;saved=false;$('#code').value='';$('#verified').checked=false;$('#result').hidden=true;$('#progress').textContent='Sẵn sàng quét bài tiếp theo.';$('#settings').disabled=false;
    for(let n=1;n<=2;n++){$('#preview'+n).hidden=true;$('#preview'+n).removeAttribute('src');$('#remove'+n).hidden=true;}
    $('#code').focus();$('#code').scrollIntoView({behavior:'smooth',block:'center'});
  };
  $('#export').onclick=()=>{const b=new Blob([C.csv(rows)],{type:'text/csv;charset=utf-8;'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='FPTBN-cham-thu.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
  if(token){$('#workspace').hidden=false;run(checkOCR)();}else showLogin();
  window.addEventListener('pagehide',stop);
  window.addEventListener('beforeunload',e=>{if(rows.length||pages.some(Boolean)||result){e.preventDefault();e.returnValue='';}});
})();
