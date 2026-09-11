<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Language strings for local_agentpoc plugin.
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$string['pluginname'] = 'Moodle Agent POC Local Plugin';
$string['agentpoc:view'] = 'View course structures, activities, and questions via Agent POC web services';
$string['agentpoc:manage'] = 'Manage courses, sections, activities, and questions via Agent POC web services';
$string['agentpoc:createcoursewithai'] = 'Create courses using AI Course Builder';
$string['servicename'] = 'Moodle Agent POC Service';

// Navigation and Titles
$string['createcoursewithai'] = 'Create course with AI';
$string['createcoursewithai_desc'] = 'Use a syllabus to generate a draft course plan with sections, assignments, and quizzes.';
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

// Settings
$string['aiplatformurl'] = 'AI Platform URL';
$string['aiplatformurl_desc'] = 'Base URL of the AI Platform API (e.g. http://host.docker.internal:3000 for Docker Moodle).';
$string['aiplatformtimeout'] = 'AI Platform Request Timeout';
$string['aiplatformtimeout_desc'] = 'Timeout in seconds for AI Platform requests (e.g. 180 for LLM planning).';
$string['riskservicekey'] = 'Risk BFF service credential';
$string['riskservicekey_desc'] = 'Server-side shared credential used only between Moodle and the AI Platform Risk API. Never expose this value to browser JavaScript.';
$string['riskaitesttools'] = 'เปิดเครื่องมือทดสอบ AI Risk';
$string['riskaitesttools_desc'] = 'แสดงปุ่มบังคับสร้าง AI Summary ใหม่โดยข้าม cache สำหรับการทดสอบเท่านั้น ปิดไว้เป็นค่าเริ่มต้น และยังคงใช้กฎ eligibility / grounding / validation เดิมทั้งหมด';

// Wizard Steps
$string['step_upload_syllabus'] = 'Upload syllabus';
$string['step_review_plan'] = 'Review plan';
$string['step_approve'] = 'Approve';

// Step 1: Upload
$string['coursecategory'] = 'Course category';
$string['syllabusfile'] = 'Syllabus file';
$string['syllabusfile_drop'] = 'Drag and drop a file here';
$string['choosefile'] = 'Choose file';
$string['optionalnotes'] = 'Structure Instruction (Optional)';
$string['optionalnotes_placeholder'] = 'e.g., Emphasize C# examples, beginner-friendly explanations, focus on core OOP concepts...';
$string['optionalnotes_hint'] = 'These notes shape Course Structure only. Quiz and Assignment are selected explicitly later in the Activity Structure step.';
$string['generateplan'] = 'Generate Course Structure';
$string['generatestructure'] = 'Generate course structure';
$string['reviewstructure'] = 'Review course structure';
$string['sealstructure'] = 'Confirm structure';
$string['materialformatunsupported'] = 'Unsupported learning material format: {$a}';
$string['materialfiletoolarge'] = 'Learning material file is larger than the 30 MB POC limit: {$a}';
$string['materialrequired'] = 'Learning Material is required for section {$a}.';
$string['materialdraftnotfound'] = 'Learning Material draft {$a} was not found or is not owned by the current teacher.';

// Step 2: Review Plan
$string['generatedcourseplanpreview'] = 'Course Structure';
$string['warningassumptions'] = 'Warnings / Assumptions';
$string['edittitle'] = 'Edit title';
$string['editsection'] = 'Edit section';
$string['addsection'] = 'Add section';
$string['regenerate'] = 'Regenerate Structure';
$string['continuetoapproval'] = 'Continue to Activity Structure';
$string['savechanges'] = 'Save changes';
$string['cancel'] = 'Cancel';

// Step 3: Approve
$string['whatwillbecreated'] = 'What will be created';
$string['plannedsections'] = 'Planned sections';
$string['assignments'] = 'Assignments';
$string['quizzes'] = 'Quizzes';
$string['beforeyouapprove'] = 'Before you approve';
$string['coursewillbehidden'] = 'Course will be created as Hidden';
$string['youcaneditlater'] = 'You can edit later';
$string['nostudentswillsee'] = 'No students will see it until published';
$string['draftcoursecreatednotice'] = 'A draft course will be created. You\'ll be taken to the course to review and edit.';
$string['backtoreview'] = 'Back to Activity Structure';
$string['approvecoursedraft'] = 'Approve and create draft';

// Execution & Progress
$string['approvalchecked'] = 'Approval checked';
$string['planvalidated'] = 'Plan validated';
$string['creatingmoodlecourse'] = 'Creating Moodle course';
$string['verifyingresult'] = 'Verifying result';
$string['coursecreatedsuccessfully'] = 'Course created successfully';
$string['opencourseinmoodle'] = 'Open course in Moodle';
$string['createanothercourse'] = 'Create another course';

// Error messages
$string['errorinvalidcategory'] = 'Invalid course category ID: {$a}';
$string['errorcategorynotvisible'] = 'Course category is not visible or accessible';
$string['errorcoursenotfound'] = 'Course not found with ID: {$a}';
$string['errorsectionnotfound'] = 'Course section not found with ID: {$a}';
$string['erroractivitynotfound'] = 'Activity module not found with ID (CMID): {$a}';
$string['errornotanassignment'] = 'Activity module with ID {$a} is not an assignment';
$string['errornotaquiz'] = 'Activity module with ID {$a} is not a quiz';
$string['errorquestionnotfound'] = 'Question not found with ID: {$a}';
$string['errorquestionbankentrynotfound'] = 'Question bank entry not found with ID: {$a}';
$string['errorquestionalreadyinquiz'] = 'Question with bank entry ID {$a} already exists in the quiz';
$string['errorunsupportedqtype'] = 'Unsupported question type: {$a}. Allowed types: multichoice, truefalse, shortanswer, essay';
$string['errorshortnamerequired'] = 'Course shortname is required and cannot be empty';
$string['errorshortnameexists'] = 'Course with shortname "{$a}" already exists';
$string['errornocategorypermission'] = 'You do not have permission to create courses in any category.';
$string['errorcategorypermissiondenied'] = 'Permission denied: you cannot create courses in the selected category.';
$string['erroraiplatform'] = 'AI Platform error: {$a}';
$string['errormissingfile'] = 'Please select a syllabus file to upload.';
$string['errorriskstudentaccess'] = 'นักเรียนที่ร้องขอไม่ได้ลงทะเบียนแบบใช้งานอยู่ในรายวิชานี้';
$string['errorrisksnapshotrequired'] = 'ต้องระบุรหัสสแนปช็อตความเสี่ยงสำหรับการดูรายละเอียด';
$string['errorriskcompetencynotfound'] = 'ไม่พบสมรรถนะที่ร้องขอ';
$string['errorriskplatformunavailable'] = 'ระบบวิเคราะห์ความเสี่ยงไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่อีกครั้ง';
$string['errortryagain'] = 'ลองอีกครั้ง';
