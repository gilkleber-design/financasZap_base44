export default function DashboardLogo({ className = 'h-14 w-14', variant = 'dark' }) {
  const logoUrl = variant === 'light' ?
  'https://media.base44.com/images/public/69e8f3a2e9ed0f3c08b392f8/b13ee8e1b_LogoSVG_fundootransparente.svg' :
  'https://media.base44.com/images/public/69e8f3a2e9ed0f3c08b392f8/bf28f0603_LogoSVG.svg';

  return (
    <img 
      src={logoUrl}
      alt="FinançasZap"
      className={className} 
    />
  );


}