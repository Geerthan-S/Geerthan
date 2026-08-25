export interface SkillRecord { id:string; version:number; name:string; category:string; status:string; mastery:number; target:string; deadline:string|null; }
export interface RoadmapRecord { id:string; skillId:string; title:string; description:string; status:string; progress:number; version:number; }
export interface LearningTopicRecord { id:string; skillId:string; roadmapId:string|null; title:string; status:string; confidence:number; mastery:number; lastRevisedAt:string|null; nextRevisionOn:string|null; weak:boolean; sortOrder:number; version:number; }
export interface LearningSessionRecord { id:string; skillId:string; topicId:string|null; startedAt:string; endedAt:string|null; durationMinutes:number; notes:string; evidenceUrl:string; }
export interface LearningResourceRecord { id:string; skillId:string; topicId:string|null; title:string; resourceType:string; url:string; status:string; }
export interface CourseRecord { id:string; skillId:string|null; title:string; provider:string; status:string; progress:number; certificateUrl:string; version:number; }
export interface LearningGoalRecord { id:string; skillId:string|null; title:string; targetValue:number; currentValue:number; unit:string; deadline:string|null; version:number; }
export interface DsaProblemRecord { id:string; platform:string; externalId:string; title:string; difficulty:"easy"|"medium"|"hard"; solvedAt:string; confidence:number; notes:string; url:string; }
export interface SubjectRecord { id:string; semesterId:string; facultyId:string|null; code:string; name:string; credits:number; attendanceTarget:number; syllabusProgress:number; color:string; version:number; }
export interface AttendanceSummaryRecord { subjectId:string; code:string; name:string; attendanceTarget:number; totalClasses:number; attendedClasses:number; attendancePercentage:number; }
export interface AssignmentRecord { id:string; subjectId:string; title:string; description:string; status:string; dueAt:string|null; grade:string; version:number; }
export interface ExamRecord { id:string; subjectId:string; title:string; examType:string; startsAt:string; durationMinutes:number; weight:number; syllabusProgress:number; version:number; }
export interface AcademicTopicRecord { id:string; subjectId:string; title:string; status:string; progress:number; priority:string; version:number; }
export interface TimetableRecord { id:string; subjectId:string; weekday:number; startsAt:string; endsAt:string; location:string; entryType:string; }

export interface LearningSnapshot {
  skills:SkillRecord[]; roadmaps:RoadmapRecord[]; topics:LearningTopicRecord[]; sessions:LearningSessionRecord[];
  resources:LearningResourceRecord[]; courses:CourseRecord[]; goals:LearningGoalRecord[]; problems:DsaProblemRecord[];
  subjects:SubjectRecord[]; attendance:AttendanceSummaryRecord[]; assignments:AssignmentRecord[]; exams:ExamRecord[];
  academicTopics:AcademicTopicRecord[]; timetable:TimetableRecord[];
  growthSummary:{ learningMinutes:number; activeSkills:number; revisionsDue:number; averageMastery:number; };
  dsaSummary:{ solved:number; easy:number; medium:number; hard:number; streak:number; target:number; remaining:number; dailyPace:number; weakTopics:string[]; interviewReadiness:number; };
  academicSummary:{ lowAttendance:AttendanceSummaryRecord[]; dueAssignments:number; upcomingExams:number; credits:number; };
}
