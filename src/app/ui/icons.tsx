// אייקון האזהרה (עיגול עם סימן קריאה) - היה מצויר שלוש פעמים בנפרד עם ערכי stroke
// שנסחפו זה מזה (search-box, שני מקומות ב-login). אוחד לכאן לפי כלל השימוש החוזר (26.8)
export function AlertIcon({
  size = 15, strokeWidth = 2, className,
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}
