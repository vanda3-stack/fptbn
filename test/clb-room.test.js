"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {teacherRoom,teacherClasses,studentRoom}=require("../lib/clb-room");
test("students from multiple classes can join CLB; normal and EXAM routes remain independent",()=>{
  assert.equal(studentRoom({clbMode:true},"6A1"),"CLB");
  assert.equal(studentRoom({clbMode:true},"9A3"),"CLB");
  assert.equal(studentRoom({examMode:true,clbMode:true},"9A3"),"EXAM");
  assert.equal(studentRoom({classCode:"CLB"},"7A2"),"7A2");
  assert.equal(studentRoom({clbMode:"true"},"7A2"),"7A2");
});
test("teacher class list adds CLB once and virtual rooms do not need a class DB row",()=>{
  const rows=[{class_code:"6A1"},{class_code:"CLB"}];
  assert.deepEqual(teacherClasses(rows).map(x=>x.class_code),["6A1","CLB"]);
  assert.equal(rows.length,2);
  assert.equal(teacherRoom("clb").class_code,"CLB");
  assert.equal(teacherRoom("EXAM").class_code,"EXAM");
  assert.equal(teacherRoom("6A1"),null);
});
test("CLB page enables teacher screen and emits its room flag on join and reconnect",()=>{
  const html=fs.readFileSync(path.join(__dirname,"../public/clb.html"),"utf8");
  const js=fs.readFileSync(path.join(__dirname,"../public/js/student.js"),"utf8");
  assert.match(html,/window\.FPTBN_CLB_MODE = true/);
  assert.match(html,/<video id="teacherVideo" autoplay playsinline><\/video>/);
  assert.doesNotMatch(html,/window\.FPTBN_EXAM_MODE = true/);
  assert.equal((js.match(/clbMode: window\.FPTBN_CLB_MODE === true/g)||[]).length,2);
});
