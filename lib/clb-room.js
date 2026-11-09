"use strict";
const CLUB = Object.freeze({id:0,class_code:"CLB",class_name:"Lớp CLB (nhiều lớp)",grade_level:null,school_year:""});
function teacherRoom(code) {
  const value = String(code || "").trim().toUpperCase();
  if (value === "EXAM") return {id:0,class_code:"EXAM",class_name:"Phòng thi chung (nhiều lớp)",school_year:""};
  if (value === "CLB") return {...CLUB};
  return null;
}
function teacherClasses(rows) {
  return [...(Array.isArray(rows)?rows:[]).filter(row=>String(row.class_code||"").trim().toUpperCase()!=="CLB"),{...CLUB}];
}
function studentRoom(data,enrolledClassCode) {
  if (data?.examMode === true) return "EXAM";
  if (data?.clbMode === true) return "CLB";
  return String(enrolledClassCode || "").trim().toUpperCase();
}
module.exports={teacherRoom,teacherClasses,studentRoom};
