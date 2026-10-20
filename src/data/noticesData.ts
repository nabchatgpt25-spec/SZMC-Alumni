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

export const OFFICIAL_NOTICES: OfficialNotice[] = [
  {
    id: 'notice-2026-01',
    refNo: 'SZMCAA/NOT-2026/041',
    title: 'Registration Open for Grand Reunion & Medical Conference 2026',
    category: 'Reunion',
    publishedDate: '2026-09-15',
    isUrgent: true,
    summary: 'Online registration is now open for all alumni doctors from Batch 01 (1992) to Batch 35 (2026) for the 3-day Grand Reunion at SZMC Campus, Bogura.',
    fullContent: `This is to notify all esteemed alumni doctors and students at home and abroad that the Central Organizing Committee of Shaheed Ziaur Rahman Medical College Alumni Association (SZMCAA) cordially invites all former students to register for the Grand Reunion & Scientific Conference 2026.\n\nDate: December 18-20, 2026\nVenue: Shaheed Ziaur Rahman Medical College Campus, Silimpur, Bogura-5800\n\nRegistration Fee includes:\n- Official Reunion Souvenir Book & Doctor Crest\n- Commemorative Apron/Polo Shirt & Delegate ID Badge\n- Full 3-day CME scientific sessions, cultural gala, and banquet dinner\n\nPlease complete your online registration with your BMDC Registration Number or College Roll before November 15, 2026 to ensure souvenir crest engraving.`,
    pdfUrl: '#',
    fileSize: '1.4 MB',
    signatory: {
      name: 'Dr. Shahabuddin Ahmed, MBBS (SZMC-01), FCPS',
      designation: 'General Secretary',
      organization: 'Shaheed Ziaur Rahman Medical College Alumni Association'
    }
  },
  {
    id: 'notice-2026-02',
    refNo: 'SZMCAA/MEM-2026/028',
    title: 'Application Schedule for Doctor Life Membership Digital Smart Card',
    category: 'Membership',
    publishedDate: '2026-09-10',
    isUrgent: false,
    summary: 'Eligible MBBS doctors who completed medical education from SZMC can now apply for the Life Membership RFID/QR Smart Card with lifelong privileges.',
    fullContent: `All MBBS graduates of Shaheed Ziaur Rahman Medical College who hold valid BMDC registration are eligible to apply for Life Membership.\n\nRequired Documents:\n1. Copy of SZMC MBBS Passing Certificate / BMDC Registration Certificate\n2. 2 Passport size photographs (digital upload)\n3. Life Membership Subscription: BDT 5,000 / USD 50 (for overseas alumni)\n\nSmart cards can be collected from the Alumni Secretariat, College Administrative Block, SZMC Bogura or requested for domestic courier delivery.`,
    pdfUrl: '#',
    fileSize: '890 KB',
    signatory: {
      name: 'Dr. Kazi Mahfuzur Rahman, MBBS (SZMC-08), MD',
      designation: 'Convener, Membership Verification Committee',
      organization: 'Shaheed Ziaur Rahman Medical College Alumni Association'
    }
  },
  {
    id: 'notice-2026-03',
    refNo: 'SZMCAA/SCH-2026/014',
    title: 'Call for Nominations: SZMC Student Welfare & Research Grant 2026-27',
    category: 'Scholarship',
    publishedDate: '2026-09-02',
    isUrgent: true,
    summary: 'The Alumni Welfare Trust invites medical student aid and research grant applications from currently enrolled MBBS students and intern doctors of SZMC.',
    fullContent: `To encourage clinical research and support deserving students, the SZMCAA Trust Fund will disburse 25 full financial aids and 5 clinical research mini-grants for the academic year 2026-27.\n\nCriteria:\n- Demonstrated academic commitment with good standing in Professional MBBS examinations\n- Verified household financial need or distress\n- Applications can be submitted directly through the Alumni Welfare portal or handed in to the Principal office.`,
    pdfUrl: '#',
    fileSize: '1.1 MB',
    signatory: {
      name: 'Prof. Dr. Tanveer Hossain, MBBS (SZMC-03), MS',
      designation: 'Trustee Secretary, Welfare & Research Trust',
      organization: 'Shaheed Ziaur Rahman Medical College Alumni Association'
    }
  },
  {
    id: 'notice-2026-04',
    refNo: 'SZMCAA/AGM-2026/009',
    title: 'Notice for Annual General Meeting (AGM) and Executive Committee Election',
    category: 'AGM',
    publishedDate: '2026-08-28',
    isUrgent: false,
    summary: 'The AGM of SZMCAA will be held at the Main College Auditorium, SZMC Campus on Saturday, November 28, 2026 at 10:00 AM.',
    fullContent: `Notice is hereby given that the Annual General Meeting (AGM) of the General Members of Shaheed Ziaur Rahman Medical College Alumni Association will be held on Saturday, November 28, 2026 at the College Auditorium.\n\nAgenda:\n1. Confirmation of minutes of previous AGM\n2. Presentation & adoption of Annual Activity & Medical Camp Report\n3. Presentation of Audited Accounts for FY 2025-26\n4. Approval of Budget for FY 2026-27\n5. Announcement of Election Commission for Executive Committee 2027-29\n6. Address by Chief Patron & Principal, SZMC Bogura\n\nAll Life Members and Registered Doctor Members are cordially requested to attend.`,
    pdfUrl: '#',
    fileSize: '750 KB',
    signatory: {
      name: 'Prof. Dr. Masud Karim, MBBS (SZMC-01), FCPS',
      designation: 'President',
      organization: 'Shaheed Ziaur Rahman Medical College Alumni Association'
    }
  },
  {
    id: 'notice-2026-05',
    refNo: 'SZMCAA/GEN-2026/017',
    title: 'Inter-Batch Doctors Cricket & Badminton Carnival 2026 Fixtures',
    category: 'General',
    publishedDate: '2026-08-14',
    isUrgent: false,
    summary: 'Fixtures and rules announced for the annual winter sports carnival featuring teams from Batch 01 to Batch 35.',
    fullContent: `The Sports & Recreation Subcommittee has finalized team registrations and schedule for the Inter-Batch Doctors Sports Carnival 2026.\n\nVenues: SZMC Campus Sports Grounds & Indoor Badminton Court\nInauguration: Friday, October 24, 2026\nFormat: 8-a-side Cricket Tournament & Badminton Doubles Cup.\n\nBatch coordinators are advised to collect their team kits from the Alumni office by October 18.`,
    pdfUrl: '#',
    fileSize: '2.2 MB',
    signatory: {
      name: 'Dr. Sadman Sakib, MBBS (SZMC-22)',
      designation: 'Secretary, Sports & Cultural Affairs',
      organization: 'Shaheed Ziaur Rahman Medical College Alumni Association'
    }
  }
];

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
