export interface Student {
  id: string;
  name: string;
  /** 실제 이메일 (선택). 있으면 비밀번호 재설정 메일을 받을 수 있다 */
  email?: string;
  /** Firebase Auth uid. 최초 비밀번호 설정 시 기록되며, Firestore 규칙의 본인 확인에 쓰인다 */
  uid?: string;
}

// 관리자용 학번 (강민제님)
export const ADMIN_ID = "22360002";

// 팀원 목록은 이제 Firestore에서 동적으로 관리합니다.
// 초기 마이그레이션을 위해 빈 배열로 설정합니다.
export const teamMembers: Student[] = [];

export const getStudentName = (id: string, dynamicTeam: Student[] = []) => {
  if (id === ADMIN_ID) return "강민제"; 
  const found = dynamicTeam.find(m => m.id === id);
  return found?.name || "알 수 없는 사용자";
};
