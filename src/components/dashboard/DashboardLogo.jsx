export default function DashboardLogo({ className = 'h-7 w-7' }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M2 4C2 2.9 2.9 2 4 2h20c1.1 0 2 .9 2 2v16c0 1.1-.9 2-2 2H8l-6 4V4z" stroke="white" strokeWidth="1.6" fill="none"/>
      <rect x="6" y="13" width="3" height="5" rx="1" fill="#0FA3A3"/>
      <rect x="11" y="10" width="3" height="8" rx="1" fill="#0FA3A3"/>
      <rect x="16" y="7" width="3" height="11" rx="1" fill="#0FA3A3"/>
      <circle cx="22" cy="6" r="4" fill="#0FA3A3"/>
      <path d="M20 6l1.4 1.4L24 4.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}