export interface OfficialNotice {
  id: string;
  refNo: string;
  title: string;
  category: 'Membership' | 'Reunion' | 'Scholarship' | 'General' | 'AGM';
  publishedDate: string;
  isUrgent?: boolean;
  summary: string;
  fullContent: string;
  pdfUrl?: string;
  fileSize?: string;
  signatory: {
    name: string;
    designation: string;
    organization: string;
  };
}

export const OFFICIAL_NOTICES: OfficialNotice[] = [];

export const BANK_DONATION_INFO = {
  bankName: 'Sonali Bank PLC / Dutch-Bangla Bank',
  branch: 'Medical College Branch, Silimpur, Bogura',
  accountTitle: 'Shaheed Ziaur Rahman Medical College Alumni Association',
  accountNumber: '1102938475001',
  routingNumber: '225272341',
  swiftCode: 'SONABDDH',
  bKashMerchant: '01711-923250',
  nagadMerchant: '01819-232500',
  rocketAccount: '01711-923250-9',
  secretariatAddress: 'Alumni Secretariat, Administrative Building, Shaheed Ziaur Rahman Medical College, Silimpur, Bogura-5800, Bangladesh',
  helpline: '+880 51-65001, +880 1711-923250',
  email: 'alumni@szmc.edu.bd',
};
