'use strict';
const $=s=>document.querySelector(s),E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let token=sessionStorage.getItem('ot-student-token')||'',student=null,pack=null,attempt=null,mode='flashcard',essayIndex=0,level=2,custom=false,busy=false;
async function api(path,body,method){let res=await fetch('/api/ot'+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined});let d;try{d=await res.json()}catch{throw Error('Máy chủ chưa bật phân hệ ôn tập hoặc đang lỗi.')}if(!res.ok||!d.success){if(res.status===401){token='';sessionStorage.removeItem('ot-student-token');login()}throw Error(d.message||'Không thể xử lý yêu cầu.')}return d}
function error(e){alert(e.message||e)}
function formatStudentCode(value){
 value=String(value).toUpperCase().replace(/\s+/g,'').replace(/[^A-Z0-9]/g,'');
 if(/^\d+$/.test(value))return 'FBN'+value.slice(0,5);
 const digits=value.replace(/^F?B?N?/i,'').replace(/\D/g,'').slice(0,5);
 const length=value.startsWith('FBN')?3:value.startsWith('FB')?2:value.startsWith('F')?1:0;
 return 'FBN'.slice(0,length)+digits;
}
function login(){globalThis.OTSpeech?.cancel();globalThis.OTStudy?.stop();document.body.classList.remove("quiz-playing");$('#identity').textContent='';$('#logout').hidden=true;$('#app').innerHTML=`<div class="ot-login-page"><section class="ot-login-card"><div class="ot-login-brand"><img src="/assets/branding/logo-full.png" alt="FPTBN Monitor"></div><h1>Vào ôn tập</h1><form id="loginForm"><label for="code">Mã học sinh</label><input id="code" type="text" required autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="8" inputmode="text" placeholder="FBN12345" aria-describedby="codeHint notice"><p id="codeHint" class="ot-code-hint">Nhập FBN và 5 chữ số, hoặc chỉ nhập 5 chữ số.</p><button id="otJoinButton" class="primary" type="submit">Vào ôn tập →</button><p id="notice" role="status" aria-live="polite">Nhập mã học sinh để vào bộ ôn của lớp em.</p></form></section></div>`;
 $('#code').oninput=()=>{$('#code').value=formatStudentCode($('#code').value);$('#code').setCustomValidity('');$('#code').removeAttribute('aria-invalid')};
 $('#loginForm').onsubmit=async e=>{e.preventDefault();const input=$('#code'),code=formatStudentCode(input.value);input.value=code;if(!/^FBN\d{5}$/.test(code)){input.setCustomValidity('Mã cần có dạng FBN + 5 số. Ví dụ: FBN12345');input.setAttribute('aria-invalid','true');input.reportValidity();return}
 const b=$('#otJoinButton');b.disabled=true;b.textContent='Đang đăng nhập…';$('#notice').textContent='Đang xác nhận mã học sinh…';
 try{const d=await api('/login',{student_code:code});token=d.token;student=d.student;sessionStorage.setItem('ot-student-token',token);sessionStorage.setItem('ot-student-info',JSON.stringify(student));await picker()}
 catch(err){if($('#notice')){$('#notice').textContent=err.message;$('#notice').className='error'}}
 finally{b.disabled=false;b.textContent='Vào ôn tập →'}}}
async function picker(){globalThis.OTSpeech?.cancel();globalThis.OTStudy?.stop();try{let d=await api('/packs');$('#identity').textContent=student.full_name+' · '+student.class_code;$('#logout').hidden=false;$('#app').innerHTML=`<span class="tag">${E(student.school_year)} · ${E(student.class_code)}</span><h1>Chào ${E(student.full_name)}!</h1><p class="muted">Chọn kỳ thi để ôn tập. Đây là các bộ ôn được giao cho lớp em.</p><div class="cards">${d.packs.map(p=>`<div class="card"><span class="pill">${E(student.class_code)}</span><h2>${E(p.title)}</h2><p>${p.questions} câu trắc nghiệm · ${p.essays} câu tự luận</p><p class="muted">${p.attempts.reduce((n,x)=>n+Number(x.count),0)} hoạt động ôn hoàn thành<br>${p.attempts.map(x=>E(({quiz:'Trắc nghiệm',cloze:'Điền khuyết',writing:'Luyện viết',speech:'Luyện nói',flashcard:'Thẻ nhớ'})[x.kind])+': '+Number(x.count)).join(' · ')}</p><button class="primary" data-pack="${E(p.id)}">Vào ôn tập →</button></div>`).join('')||'<div class="card">Chưa có bộ ôn đang mở cho lớp em. Hãy liên hệ giáo viên.</div>'}</div>`;document.querySelectorAll('[data-pack]').forEach(b=>b.onclick=()=>openPack(b.dataset.pack))}catch(e){error(e)}}
async function openPack(id){try{let d=await api('/packs/'+id);pack=d.pack;packHome()}catch(e){error(e)}}
// Keep the displayed order for the whole attempt; submit canonical indices.
function shuffleQuizItems(items){
 const copy=items.slice();
 for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}
 return copy;
}
function startQuizAttempt(){
 const questions=shuffleQuizItems(pack.content.questions.map((q,sourceIndex)=>{
  const optionOrder=shuffleQuizItems(q.o.map((_,i)=>i));
  return {...q,sourceIndex,optionOrder,o:optionOrder.map(i=>q.o[i]),a:optionOrder.indexOf(q.a)};
 }));
 attempt={id:crypto.randomUUID(),answers:[],pos:0,questions};quiz();
}
function quizQuestions(){return attempt.questions||pack.content.questions}
function quizAnswersForSave(){
 if(!attempt.questions)return attempt.answers.slice();
 const answers=new Array(pack.content.questions.length);
 attempt.questions.forEach((q,i)=>{answers[q.sourceIndex]=q.optionOrder[attempt.answers[i]]});
 return answers;
}
function packHome(){globalThis.OTSpeech?.cancel();globalThis.OTStudy?.stop();document.body.classList.remove("quiz-playing");$('#app').innerHTML=`<button id="back">← Chọn kỳ thi</button><h1>${E(pack.title)}</h1><p class="message">Chế độ tập trung tự bật khi ôn tập. Nếu em chuyển tab hoặc rời cửa sổ, trang sẽ nhắc em quay lại. Hãy lưu kết quả trước khi thoát.</p><div class="cards"><div class="card"><h2>▤ Ôn trắc nghiệm</h2><p>Chọn đáp án và nhận phản hồi đúng hoặc sai ngay.</p><button id="quizStart" class="primary" ${!pack.content.questions.length?'disabled':''}>Bắt đầu →</button></div><div class="card"><h2>✎ Ôn tự luận</h2><p>Học đáp án, rồi tự luyện cả câu trả lời.</p><button id="essayStart" class="green" ${!pack.content.essays.length?'disabled':''}>Bắt đầu →</button></div></div>`;$('#back').onclick=picker;$('#quizStart').onclick=()=>{startQuizAttempt()};$('#essayStart').onclick=()=>{essayIndex=0;mode='flashcard';resetEssay();essay()}}
function quiz(){let i=attempt.pos,q=quizQuestions()[i],a=attempt.answers[i];$('#app').innerHTML=`<button id="back">← Bộ ôn tập</button><p class="tag">TRẮC NGHIỆM · CÂU ${i+1}/${pack.content.questions.length}</p><div class="card"><h2>${E(q.q)}</h2>${q.o.map((s,j)=>`<button class="option ${a!==undefined?(j===q.a?'correct':j===a?'wrong':''):''}" data-answer="${j}" ${a!==undefined?'disabled':''}><b>${'ABCD'[j]}</b><span>${E(s)}</span></button>`).join('')}${a!==undefined?`<p class="${a===q.a?'success':'error'}" role="status">${a===q.a?'✓ Chính xác!':'Chưa đúng. Đáp án đúng: '+'ABCD'[q.a]}</p>`:''}<div class="toolbar"><button id="prev" ${!i?'disabled':''}>← Câu trước</button><button id="next" class="primary">${i===pack.content.questions.length-1?'Hoàn thành lượt ôn':'Câu tiếp →'}</button></div></div>`;$('#back').onclick=()=>{if(confirm('Rời lượt ôn chưa hoàn thành?'))packHome()};document.querySelectorAll('[data-answer]').forEach(b=>b.onclick=()=>{attempt.answers[i]=Number(b.dataset.answer);quiz()});$('#prev').onclick=()=>{attempt.pos--;quiz()};$('#next').onclick=async()=>{if(a===undefined){alert('Chọn đáp án trước khi tiếp tục.');return}if(i<pack.content.questions.length-1){attempt.pos++;quiz();return}if(busy)return;busy=true;$('#next').disabled=true;try{let d=await api('/packs/'+pack.id+'/attempts',{id:attempt.id,kind:'quiz',answers:quizAnswersForSave()});$('#app').innerHTML=`<div class="card"><span class="tag">ĐÃ GHI NHẬN LƯỢT ÔN</span><h1>${d.result.score}/${d.result.total} câu đúng</h1><button id="again" class="primary">Ôn lại</button><button id="return">Về bộ ôn</button></div>`;$('#again').onclick=()=>{startQuizAttempt()};$('#return').onclick=packHome}catch(e){error(e);quiz()}finally{busy=false}}}
$('#logout').onclick=async()=>{globalThis.OTSpeech?.cancel();globalThis.OTStudy?.stop();try{await api('/logout',{})}catch{}token='';sessionStorage.removeItem('ot-student-token');sessionStorage.removeItem('ot-student-info');pack=null;login()};



