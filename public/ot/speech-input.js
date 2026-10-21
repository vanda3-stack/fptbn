'use strict';
// Commit only final recognition text. Our server receives no audio.
(function(root){
 let session=null;
 const supported=()=>!!(root.SpeechRecognition||root.webkitSpeechRecognition)&&root.isSecureContext!==false;
 function finish(s,message){if(session!==s)return;session=null;clearTimeout(s.timer);s.rec.onresult=s.rec.onerror=s.rec.onend=null;try{s.rec.abort()}catch{}s.onState(false,message)}
 function cancel(){if(session)finish(session,'Đã dừng nhận diện. Văn bản đã nhận được giữ lại.')}
 function start({initial='',onText,onState}){
  cancel();if(!supported()){onState(false,'Trình duyệt chưa hỗ trợ. Em vẫn có thể gõ câu trả lời.');return}
  const Rec=root.SpeechRecognition||root.webkitSpeechRecognition,rec=new Rec(),s={rec,base:initial.trim(),parts:[],timer:null,ending:false,message:'',onState};session=s;
  rec.lang='vi-VN';rec.continuous=true;rec.interimResults=true;rec.maxAlternatives=1;
  const text=()=>[s.base,...s.parts.filter(Boolean)].filter(Boolean).join(' ').slice(0,12000);
  rec.onresult=event=>{if(session!==s)return;let interim=[];for(let i=0;i<event.results.length;i++){const r=event.results[i];if(r.isFinal)s.parts[i]=r[0].transcript.trim();else interim.push(r[0].transcript)}if(s.parts.some(Boolean))onText(text());onState(true,s.ending?'Đang kết thúc nhận diện…':interim.length?'Đang nghe: '+interim.join(' '):'Đang nghe tiếng Việt…');if(text().length>=12000){s.message='Đã đạt giới hạn 12.000 ký tự.';stop()}};
  rec.onerror=event=>{if(session!==s)return;const errors={'not-allowed':'Chưa có quyền micro. Cho phép micro trong cài đặt của trang rồi thử lại.','service-not-allowed':'Dịch vụ nhận diện bị chặn. Em có thể gõ câu trả lời.','audio-capture':'Không tìm thấy micro. Kiểm tra thiết bị.','network':'Không kết nối được dịch vụ nhận diện. Kiểm tra Internet rồi thử lại.','no-speech':'Chưa nghe rõ. Nói gần micro và thử lại.','language-not-supported':'Trình duyệt chưa hỗ trợ tiếng Việt.'};finish(s,errors[event.error]||'Nhận diện đã dừng. Thử lại hoặc gõ câu trả lời.')};
  rec.onend=()=>{if(session!==s)return;finish(s,s.message||'Đã dừng. Xem lại văn bản, rồi bấm Kiểm tra đáp án.')};
  onState(true,'Đang bật micro…');try{rec.start();if(session===s)s.timer=setTimeout(()=>{if(session===s){s.message='Đã hết 3 phút. Bấm Đọc tiếp để bổ sung.';stop()}},180000)}catch{finish(s,'Không bật được nhận diện. Thử lại hoặc gõ câu trả lời.')}
 }
 function stop(){const s=session;if(!s||s.ending)return;s.ending=true;clearTimeout(s.timer);s.timer=setTimeout(()=>finish(s,'Đã dừng. Văn bản đã nhận được giữ lại.'),4000);try{s.rec.stop()}catch{finish(s,'Đã dừng nhận diện.')}}
 function markup(){return '<div class="speech-tools"><button type="button" id="essaySpeak">🎙 Đọc câu trả lời</button><span id="speechStatus" role="status" aria-live="polite"></span></div><p class="small muted speech-note">Nói tiếng Việt → dừng → xem lại văn bản → kiểm tra. Nhận diện có thể dùng dịch vụ của trình duyệt qua Internet. Website chỉ lưu văn bản và kết quả, không lưu âm thanh.</p>'}
 function mount(draft){const button=document.querySelector('#essaySpeak'),field=document.querySelector('#essayText'),status=document.querySelector('#speechStatus'),check=document.querySelector('#essayCheck');if(!button||!field)return;
  if(!supported()){button.disabled=true;status.textContent='Trình duyệt chưa hỗ trợ; em có thể gõ câu trả lời.';return}
  button.disabled=!!draft.result;button.onclick=()=>{if(session){button.disabled=true;button.textContent='Đang dừng…';stop();return}if(draft.result)return;draft.text=field.value;start({initial:field.value,onText:text=>{draft.text=text;draft.voice=true;field.value=text},onState:(active,message)=>{status.textContent=message;button.textContent=active?'■ Dừng nhận diện':draft.voice?'🎙 Đọc tiếp':'🎙 Đọc câu trả lời';button.disabled=!!draft.result;button.setAttribute('aria-pressed',String(active));field.readOnly=active;if(check)check.disabled=active}})};
 }
 root.OTSpeech={start,stop,cancel,supported,markup,mount,get active(){return !!session}};
 root.addEventListener?.('pagehide',cancel);root.document?.addEventListener?.('visibilitychange',()=>{if(root.document.hidden)cancel()});
})(globalThis);
