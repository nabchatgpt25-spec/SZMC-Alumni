import React from 'react';
import { useSiteConfig } from '../services/siteConfigService';

interface NDCLogoProps {
  className?: string;
  size?: number | string;
  alt?: string;
  useImgTag?: boolean;
}

/**
 * Authentic Shaheed Ziaur Rahman Medical College (SZMC Bogura) Emblem Logo Component
 * Reads live customizable logo from SiteConfig (Super Admin can change it anytime without code)
 */
export const NDCLogo: React.FC<NDCLogoProps> = ({
  className = 'w-10 h-10',
  alt = 'SZMC Logo',
}) => {
  const { config } = useSiteConfig();
  const currentLogo = config.logoUrl || '/assets/aistudio/images__1__2778177d.png';

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

export const SZMCLogo = NDCLogo;
