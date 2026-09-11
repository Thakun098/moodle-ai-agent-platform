<?php
// This file is part of Moodle - http://moodle.org/

defined('MOODLE_INTERNAL') || die();

$string['pluginname'] = 'Moodle Agent POC Local Plugin';
$string['ailearninginsight'] = 'ข้อมูลวิเคราะห์การเรียนรู้ด้วย AI';
$string['riskoverview'] = 'ภาพรวมรายวิชา';
$string['riskstudents'] = 'นักเรียน';
$string['riskstudentshelp'] = 'ตรวจสอบนักเรียนทั้งหมดจากสแนปช็อตความเสี่ยงที่เลือก';
$string['risksearchstudents'] = 'ค้นหานักเรียน';
$string['riskcourseoverview'] = 'ภาพรวมความเสี่ยงของรายวิชา';
$string['riskneedsattention'] = 'สิ่งที่ควรให้ความสนใจ';
$string['riskcourseinsight'] = 'ข้อมูลเชิงลึกของรายวิชาจาก AI';
$string['riskstudentinsight'] = 'ข้อมูลเชิงลึกของนักเรียนจาก AI';
$string['riskinsightloading'] = 'กำลังเตรียมข้อมูลเชิงลึกที่ผ่านการตรวจสอบ…';
$string['riskwhoneedsattention'] = 'นักเรียนที่ควรให้ความสนใจ';
$string['riskproblemactivities'] = 'กิจกรรมที่มีปัญหา';
$string['riskcompetencygaps'] = 'ช่องว่างสมรรถนะร่วม';
$string['riskassociations'] = 'ความสัมพันธ์ที่น่าสนใจ';
$string['riskactions'] = 'ข้อเสนอการดำเนินการสำหรับผู้สอน';
$string['riskviewallstudents'] = 'ดูนักเรียนทั้งหมด';
$string['riskrefresh'] = 'รีเฟรช';
$string['riskforceaisummary'] = 'สร้าง AI Summary ใหม่ (ทดสอบ)';
$string['riskforceaisummaryworking'] = 'กำลังสร้าง AI Summary ใหม่…';
$string['riskforceaisummarysuccess'] = 'สร้าง AI Summary ใหม่แล้ว';
$string['riskloading'] = 'กำลังโหลดสแนปช็อตความเสี่ยง…';
$string['studentriskdetail'] = 'รายละเอียดความเสี่ยงของนักเรียน';
$string['riskbacktodashboard'] = 'กลับไปยังข้อมูลวิเคราะห์การเรียนรู้';
$string['riskloadingstudent'] = 'กำลังโหลดหลักฐานความเสี่ยงของนักเรียน…';
$string['risksummary'] = 'สรุปความเสี่ยง';
$string['risktrend'] = 'แนวโน้มความเสี่ยง';
$string['riskdimensions'] = 'ความเสี่ยงแยกตามมิติ';
$string['riskprogressjourney'] = 'ความก้าวหน้าที่คาดหวังเทียบกับที่ทำได้จริง';
$string['riskassessmentevidence'] = 'หลักฐานการประเมิน';
$string['riskcompetencyevidence'] = 'หลักฐานสมรรถนะ';
$string['risksubmissionhistory'] = 'ประวัติการส่งงาน';
$string['riskruletrace'] = 'ร่องรอยกฎการประเมิน';
$string['riskruletracehelp'] = 'กฎเชิงกำหนดแต่ละข้อเชื่อมโยงกลับไปยังหลักฐานที่ตรึงไว้ในสแนปช็อตที่เลือก';
$string['riskevidencejourney'] = 'เส้นทางหลักฐาน';
$string['riskevidencehistoryhelp'] = 'ค่าข้อมูลย้อนหลังจะคงตามสแนปช็อตนี้ ส่วนลิงก์ Moodle ปัจจุบันอาจแสดงสถานะที่ใหม่กว่า';
$string['riskreviewpendinghelp'] = 'สถานะรอการทบทวนจะแสดงแยกเป็นขั้นตอนการทำงาน/ความครอบคลุมของผู้สอน และไม่ได้ทำให้ความเสี่ยงของนักเรียนสูงขึ้นด้วยตัวมันเอง';
$string['errorriskstudentaccess'] = 'นักเรียนที่ร้องขอไม่ได้ลงทะเบียนแบบใช้งานอยู่ในรายวิชานี้';
$string['errorrisksnapshotrequired'] = 'ต้องระบุรหัสสแนปช็อตความเสี่ยงสำหรับการดูรายละเอียด';
$string['errorriskcompetencynotfound'] = 'ไม่พบสมรรถนะที่ร้องขอ';
$string['errorriskplatformunavailable'] = 'ระบบวิเคราะห์ความเสี่ยงไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่อีกครั้ง';
$string['errortryagain'] = 'ลองอีกครั้ง';

$string['riskaitesttools'] = 'เปิดเครื่องมือทดสอบ AI Risk';
$string['riskaitesttools_desc'] = 'แสดงปุ่มบังคับสร้าง AI Summary ใหม่โดยข้าม cache สำหรับการทดสอบเท่านั้น ปิดไว้เป็นค่าเริ่มต้น และยังคงใช้กฎ eligibility / grounding / validation เดิมทั้งหมด';
