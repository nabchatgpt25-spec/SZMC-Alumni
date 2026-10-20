import React from 'react';

interface NDCLogoProps {
  className?: string;
  size?: number | string;
  alt?: string;
  useImgTag?: boolean;
}

/**
 * Authentic Shaheed Ziaur Rahman Medical College (SZMC Bogura) Emblem Logo Component
 * Renders the official emblem directly from /szmc-logo.png
 */
export const NDCLogo: React.FC<NDCLogoProps> = ({
  className = 'w-10 h-10',
  alt = 'Shaheed Ziaur Rahman Medical College (SZMC) Logo',
}) => {
  return (
    <img
      src="/szmc-logo.png"
      alt={alt}
      className={`${className} object-contain shrink-0 select-none`}
      loading="eager"
      decoding="async"
    />
  );
};

export const SZMCLogo = NDCLogo;


