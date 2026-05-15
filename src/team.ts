export interface Student {
  id: string;
  name: string;
}

// TODO: 관리자용 학번을 지정하세요 (본인의 학번)
export const ADMIN_ID = "22360002";

// TODO: 팀원들의 학번과 이름을 등록하세요
export const teamMembers: Student[] = [
  { id: '22660046', name: '조윤경' },
  { id: '22690007', name: '김휘성' },
  { id: '22660024', name: '도영준' },
  { id: '22660009', name: '김도연' },
  { id: '22660034', name: '신은결' },
  { id: '22660016', name: '김우솔' },
  { id: '22660052', name: '하준오' },

];

export const getStudentName = (id: string) => {
  if (id === ADMIN_ID) return "강민제"; 
  return teamMembers.find(m => m.id === id)?.name || "알 수 없는 사용자";
};
