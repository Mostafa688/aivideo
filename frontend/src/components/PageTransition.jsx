import React, { useState, useRef, useEffect } from 'react';

// ✅ NEW (طلب العميل: "عايز الدخول والخروج من اي صفحة في اليوزر مينيو يبقى بانيمشن حلو")
// بدل ما كل صفحة تدير الأنيميشن بتاعها لوحدها (زي AgentPage.handleLeaveWorkspace القديمة)،
// الراپر ده بيغلف الصفحة النشطة كلها (في App.jsx، بـkey=page) وبيدي أي تنقل بين أي صفحتين
// نفس الإحساس: خروج (workspaceExit) بيلعب على الصفحة القديمة الأول، وبعد ما يخلص بالظبط
// (نفس مدة الأنيميشن في global.css) بندخل الصفحة الجديدة بأنيميشن الدخول (workspaceEnter).
// بيستخدم نفس الـkeyframes الموجودة فعليًا في global.css عشان الإحساس يفضل موحّد في الموقع كله.
const EXIT_MS = 220; // لازم يتطابق مع مدة .workspace-exiting في global.css

export default function PageTransition({ pageKey, children }) {
  const [displayedKey, setDisplayedKey] = useState(pageKey);
  const [phase, setPhase] = useState('enter');
  const contentRef = useRef(children);
  const timeoutRef = useRef(null);

  // لسه في نفس الصفحة (props اتغيرت جوه نفس الصفحة بس) — حدّث المحتوى فورًا من غير أي تأخير
  if (displayedKey === pageKey) {
    contentRef.current = children;
  }

  useEffect(() => {
    if (pageKey === displayedKey) return undefined;
    setPhase('exit');
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      contentRef.current = children;
      setDisplayedKey(pageKey);
      setPhase('enter');
    }, EXIT_MS);
    return () => clearTimeout(timeoutRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey]);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  return (
    <div key={displayedKey} className={phase === 'exit' ? 'workspace-exiting' : 'workspace-transition'}>
      {contentRef.current}
    </div>
  );
}
