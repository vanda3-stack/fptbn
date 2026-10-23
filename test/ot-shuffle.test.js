const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');

function harness(game=true){
 const els={},posts=[];let buttons=[];
 const element=()=>({disabled:false,textContent:'',innerHTML:''});
 const app=element();
 Object.defineProperty(app,'innerHTML',{get(){return this.html||''},set(html){this.html=html;buttons=[...html.matchAll(/data-(?:play-)?answer="(\d+)"/g)].map(m=>({dataset:{playAnswer:m[1],answer:m[1]}}))}});
 els['#app']=app;
 let random=0;
 const math=Object.create(Math);math.random=()=>random;
 const ctx={Math:math,document:{body:{classList:{add(){},remove(){}}},querySelector:s=>els[s]||(els[s]=element()),querySelectorAll:()=>buttons},sessionStorage:{getItem(){return null}},crypto:require('node:crypto').webcrypto,confirm:()=>true,alert(){},fetch:async(url,options)=>{const body=JSON.parse(options.body);posts.push(body);if(posts.length===1)throw Error('Mất mạng');return {ok:true,json:async()=>({success:true,result:{score:2,total:2}})}}};
 vm.createContext(ctx);
 for(const file of ['student.js',...(game?['quiz-play.js']:[])])vm.runInContext(fs.readFileSync('public/ot/'+file,'utf8'),ctx);
 const run=s=>vm.runInContext(s,ctx),json=s=>JSON.parse(JSON.stringify(run(s)));
 run("token='t';pack={id:'p',title:'Ôn',content:{questions:[{q:'Một?',o:['a1','b1','c1','d1'],a:1},{q:'Hai?',o:['a2','b2','c2','d2'],a:3}]}};startQuizAttempt()");
 return {els,app,posts,run,json,setRandom:n=>random=n,get buttons(){return buttons}};
}

for(const game of [false,true])test(`shuffle preserves feedback and server scoring, retry and restart (${game?'game':'basic'})`,async()=>{
 const h=harness(game),original=h.json('pack.content.questions'),order=h.json('attempt.questions'),id=h.run('attempt.id');
 assert.deepEqual(order.map(q=>q.sourceIndex),[1,0]);
 assert.deepEqual(order[0].o,['b2','c2','d2','a2']);
 assert.equal(order[0].a,2);
 assert.deepEqual(h.json('pack.content.questions'),original);
 const next=game?'#playNext':'#next';
 for(let i=0;i<2;i++){
  h.buttons[h.run('quizQuestions()[attempt.pos].a')].onclick();
  assert(h.app.innerHTML.includes('Chính xác!'));
  if(i===0)await h.els[next].onclick();
 }
 assert.deepEqual(h.json('quizAnswersForSave()'),[1,3]);
 if(game)assert(h.app.innerHTML.includes('2 đúng'));
 await h.els[next].onclick(); // First save fails: preserve attempt and order.
 assert.equal(h.run('attempt.id'),id);
 assert.deepEqual(h.json('attempt.questions'),order);
 await h.els[next].onclick();
 assert.equal(h.posts.length,2);
 assert.deepEqual(h.posts[0],h.posts[1]);
 assert.deepEqual(h.posts[1].answers,[1,3]);
 h.setRandom(.999);
 h.els[game?'#playAgain':'#again'].onclick();
 assert.notEqual(h.run('attempt.id'),id);
 assert.deepEqual(h.json('attempt.answers'),[]);
 assert.equal(h.run('attempt.pos'),0);
 assert.deepEqual(h.json('attempt.questions.map(q=>q.sourceIndex)'),[0,1]);
 assert.deepEqual(h.json('attempt.questions[0].o'),original[0].o);
 assert.deepEqual(h.json('pack.content.questions'),original);
});
