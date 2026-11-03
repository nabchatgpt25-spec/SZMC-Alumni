import React from 'react';
import { useSiteConfig } from '../services/siteConfigService';

interface SZMCLogoProps {
  className?: string;
  size?: number | string;
  alt?: string;
  useImgTag?: boolean;
}

/**
 * Authentic Shaheed Ziaur Rahman Medical College (SZMC Bogura, Estd. 1992) Emblem Logo Component
 * Reads live customizable logo from SiteConfig (Super Admin can change it anytime without code)
 */
export const SZMCLogo: React.FC<SZMCLogoProps> = ({
  className = 'w-10 h-10',
  alt = 'SZMC Logo',
}) => {
  const { config } = useSiteConfig();
  const currentLogo =
    config.logoUrl && !config.logoUrl.includes('images__1__')
      ? config.logoUrl
      : '/szmc-logo.png';

  return (
    <img
      src={currentLogo}
      alt={alt || config.siteTitle}
      className={`${className} object-contain shrink-0 select-none`}
      loading="eager"
      decoding="async"
    />
  );
};
