import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ShieldCheck,
  Building2,
  MapPin,
  GraduationCap,
  Award,
  ArrowRight,
  Users,
  Sparkles,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  Star,
  ExternalLink
} from 'lucide-react';
import { AlumniProfile } from '../../types';
import {
  MagneticWrap,
  ScrollReveal,
  Tilt3DCard,
} from '../motion/CinematicMotion';
import campusHeroImg from '../../assets/images/ndc_campus_hero_1790233370828.jpg';

interface FeaturedAlumniSectionProps {
  alumniList: AlumniProfile[];
  onSelectAlumnus: (alumnus: AlumniProfile) => void;
  onExploreDirectory: () => void;
}

type EliteCategory = 'all' | 'surgery' | 'medicine' | 'pediatrics' | 'academia' | 'global';

// Prominent Shaheed Ziaur Rahman Medical College (SZMC Bogura) Alumni Doctors
export const FAMOUS_SZMC_ALUMNI: AlumniProfile[] = [
  {
    id: 1001,
    userId: 1001,
    fullName: 'Prof. Dr. Tariqul Islam, FCPS, FRCS',
    avatarUrl: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=400&auto=format&fit=crop&q=80',
    coverUrl: campusHeroImg,
    batchYear: 1,
    session: '1991-92 (Pioneer Batch 01)',
    group: 'General Surgery & Laparoscopy',
    collegeRoll: 'SZMC-01-008',
    profession: 'Professor & Head of General Surgery',
    position: 'Chief of Department & Laparoscopic Surgeon',
    institution: 'Shaheed Ziaur Rahman Medical College & Hospital (SZMCH)',
    city: 'Bogura',
    country: 'Bangladesh',
    specialty: ['Laparoscopic Surgery', 'Colorectal Surgery', 'Surgical Oncology'],
    degree: ['MBBS (SZMC, Batch 01)', 'FCPS (Surgery, BCPS)', 'FRCS (Glasgow)'],
    badges: ['Pioneer SZMCian (Batch 01)', 'Gold Medalist Surgery', 'BCPS Faculty'],
    bio: 'Pioneer Batch 01 graduate of Shaheed Ziaur Rahman Medical College (Session 1991-92). Has performed over 8,000 surgical interventions and trained dozens of surgeon fellows across Bangladesh.',
    careerHistory: [
      'Professor & Head, Department of Surgery, SZMCH Bogura (2020–Present)',
      'Associate Professor of Surgery, Rajshahi Medical College Hospital',
      'Fellow, Royal College of Physicians and Surgeons of Glasgow',
      'Examiner & Councillor, Bangladesh College of Physicians and Surgeons (BCPS)'
    ],
    isPublic: true,
    online: false,
    postsCount: 24,
  },
  {
    id: 1002,
    userId: 1002,
    fullName: 'Prof. Dr. Shireen Akhter, FCPS, MS',
    avatarUrl: 'https://images.unsplash.com/photo-1594824813589-35431f496ee8?w=400&auto=format&fit=crop&q=80',
    coverUrl: campusHeroImg,
    batchYear: 2,
    session: '1992-93 (Batch 02)',
    group: 'Obstetrics & Gynaecology',
    collegeRoll: 'SZMC-02-019',
    profession: 'Professor of Obstetrics & Gynaecology',
    position: 'Professor & Clinical In-Charge Maternal Health',
    institution: 'Shaheed Ziaur Rahman Medical College Hospital',
    city: 'Bogura',
    country: 'Bangladesh',
    specialty: ['High-Risk Pregnancy', 'Fetal Medicine', 'Infertility & Laparoscopy'],
    degree: ['MBBS (SZMC, Batch 02)', 'FCPS (Gynae & Obs)', 'MS (Obstetrics & Gynaecology)'],
    badges: ['SZMC Batch 02', 'OGSB Executive Member', 'Distinguished Clinician'],
    bio: 'Dedicated two decades to maternal and reproductive health in northern Bangladesh. Pioneer leader in maternal mortality reduction programs and postgraduate clinical training at SZMC.',
    careerHistory: [
      'Professor of Gynaecology & Obstetrics, SZMC Bogura',
      'Former Associate Professor, Rangpur Medical College',
      'Member, Obstetrical and Gynaecological Society of Bangladesh (OGSB)',
      'Lead Investigator, Safe Motherhood Clinical Protocol Initiative'
    ],
    isPublic: true,
    online: false,
    postsCount: 19,
  },
  {
    id: 1003,
    userId: 1003,
    fullName: 'Dr. Mahbubur Rahman, MRCP (UK), FRCP (Edin)',
    avatarUrl: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=400&auto=format&fit=crop&q=80',
    coverUrl: campusHeroImg,
    batchYear: 1,
    session: '1991-92 (Batch 01)',
    group: 'Cardiology',
    collegeRoll: 'SZMC-01-002',
    profession: 'Consultant Interventional Cardiologist',
    position: 'Consultant Cardiologist & Clinical Director',
    institution: 'Barts Health NHS Trust & Royal London Hospital',
    city: 'London',
    country: 'United Kingdom',
    specialty: ['Interventional Cardiology', 'Coronary Angioplasty & Stenting', 'Heart Failure Management'],
    degree: ['MBBS (SZMC, Batch 01)', 'MRCP (UK)', 'FRCP (Edinburgh)', 'Fellow European Society of Cardiology (FESC)'],
    badges: ['Pioneer Batch 01', 'NHS Clinical Lead', 'Global SZMC Ambassador'],
    bio: 'SZMC Pioneer Batch alumnus practicing at leading UK cardiovascular centres. Coordinates foreign clinical observerships for young SZMC doctors and medical interns.',
    careerHistory: [
      'Consultant Interventional Cardiologist, Barts Health NHS Trust, London',
      'Fellow of the Royal College of Physicians of Edinburgh',
      'Lead, Acute Coronary Syndrome Intervention Unit',
      'Founding Patron, UK SZMC Doctors Fraternity'
    ],
    isPublic: true,
    online: true,
    postsCount: 22,
  },
  {
    id: 1004,
    userId: 1004,
    fullName: 'Dr. Tanvir Ahmed, FCPS, MD',
    avatarUrl: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400&auto=format&fit=crop&q=80',
    coverUrl: campusHeroImg,
    batchYear: 5,
    session: '1995-96 (Batch 05)',
    group: 'Cardiology & Electrophysiology',
    collegeRoll: 'SZMC-05-041',
    profession: 'Associate Professor of Cardiology',
    position: 'Chief of Cardiac Electrophysiology & Pacing',
    institution: 'National Institute of Cardiovascular Diseases (NICVD)',
    city: 'Dhaka',
    country: 'Bangladesh',
    specialty: ['Electrophysiology', 'Pacemaker & ICD Implantation', 'Echocardiography'],
    degree: ['MBBS (SZMC, Batch 05)', 'FCPS (Medicine)', 'MD (Cardiology)'],
    badges: ['SZMC Batch 05', 'NICVD Consultant', 'Cardiac Specialist'],
    bio: 'Nationally recognized cardiac electrophysiologist with extensive experience in pacemaker implantations and complex arrhythmia interventions. Proud alumnus of SZMC Batch 05.',
    careerHistory: [
      'Associate Professor, NICVD Dhaka',
      'Former Assistant Professor of Cardiology, SZMCH Bogura',
      'Life Member, Bangladesh Cardiac Society',
      'Published in Heart Asia and European Journal of Cardiology'
    ],
    isPublic: true,
    online: true,
    postsCount: 16,
  },
  {
    id: 1005,
    userId: 1005,
    fullName: 'Dr. Farhana Yasmin, FCPS, MD',
    avatarUrl: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=400&auto=format&fit=crop&q=80',
    coverUrl: campusHeroImg,
    batchYear: 8,
    session: '1998-99 (Batch 08)',
    group: 'Pediatrics & Child Health',
    collegeRoll: 'SZMC-08-012',
    profession: 'Associate Professor of Pediatric Hematology',
    position: 'Associate Professor & Bone Marrow Transplant Specialist',
    institution: 'Bangabandhu Sheikh Mujib Medical University (BSMMU)',
    city: 'Dhaka',
    country: 'Bangladesh',
    specialty: ['Pediatric Hematology', 'Childhood Leukemia Protocol', 'Thalassemia Management'],
    degree: ['MBBS (SZMC, Batch 08)', 'FCPS (Pediatrics)', 'MD (Pediatric Hematology & Oncology)'],
    badges: ['SZMC Batch 08', 'BSMMU Faculty', 'Pediatric Champion'],
    bio: 'Specialist in pediatric hematology and oncology caring for children with leukemia and blood disorders. Active speaker at national pediatric congresses.',
    careerHistory: [
      'Associate Professor, Dept of Pediatric Hematology & Oncology, BSMMU',
      'Clinical Fellow in Pediatric BMT, TATA Medical Center, Kolkata',
      'Executive Committee Member, Bangladesh Pediatric Association (BPA)',
      'Organizes regular pediatric free health camps in Bogura district'
    ],
    isPublic: true,
    online: false,
    postsCount: 14,
  },
  {
    id: 1006,
    userId: 1006,
    fullName: 'Dr. Kazi Arifur Rahman, MS (Ortho)',
    avatarUrl: 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=400&auto=format&fit=crop&q=80',
    coverUrl: campusHeroImg,
    batchYear: 3,
    session: '1993-94 (Batch 03)',
    group: 'Orthopedic Surgery & Trauma',
    collegeRoll: 'SZMC-03-024',
    profession: 'Senior Consultant Orthopedic Surgeon',
    position: 'Chief of Arthroplasty & Joint Replacement',
    institution: 'National Institute of Traumatology and Orthopaedic Rehabilitation (NITOR)',
    city: 'Dhaka',
    country: 'Bangladesh',
    specialty: ['Knee & Hip Arthroplasty', 'Pelvic Trauma', 'Arthroscopic Surgery'],
    degree: ['MBBS (SZMC, Batch 03)', 'MS (Orthopedics, DU)', 'AO Trauma Fellow (Switzerland)'],
    badges: ['SZMC Batch 03', 'AO Trauma Faculty', 'NITOR Senior Surgeon'],
    bio: 'One of northern Bangladesh’s most acclaimed joint replacement surgeons, trained in Switzerland and Germany. Alumnus of SZMC Batch 03.',
    careerHistory: [
      'Senior Consultant Orthopedic Surgeon, NITOR Dhaka',
      'AO Trauma International Faculty',
      'Member, Bangladesh Orthopaedic Society (BOS)',
      'Senior Clinical Consultant, Square Hospitals Dhaka'
    ],
    isPublic: true,
    online: true,
    postsCount: 18,
  },
  {
    id: 1007,
    userId: 1007,
    fullName: 'Dr. S. M. Nazmul Huda, FCPS (Neurosurgery)',
    avatarUrl: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400&auto=format&fit=crop&q=80',
    coverUrl: campusHeroImg,
    batchYear: 6,
    session: '1996-97 (Batch 06)',
    group: 'Neurosurgery & Spine',
    collegeRoll: 'SZMC-06-033',
    profession: 'Consultant Neurosurgeon & Spine Specialist',
    position: 'Assistant Professor & Neurotrauma Consultant',
    institution: 'Dhaka Medical College Hospital (DMCH)',
    city: 'Dhaka',
    country: 'Bangladesh',
    specialty: ['Brain Tumor Surgery', 'Minimally Invasive Spine Surgery', 'Neurotrauma Intervention'],
    degree: ['MBBS (SZMC, Batch 06)', 'FCPS (Neurosurgery, BCPS)', 'WFNS Fellow (Japan)'],
    badges: ['SZMC Batch 06', 'Neurosurgeon', 'DMCH Specialist'],
    bio: 'Performs micro-neurosurgical procedures for brain tumors and spinal cord pathologies. Regular faculty in SZMC clinical symposiums and emergency trauma workshops.',
    careerHistory: [
      'Assistant Professor of Neurosurgery, DMCH',
      'Former Resident Neurosurgeon, Bangabandhu Sheikh Mujib Medical University',
      'Fellow, World Federation of Neurosurgical Societies (WFNS)',
      'Member, Bangladesh Society of Neurosurgeons (BSNS)'
    ],
    isPublic: true,
    online: false,
    postsCount: 11,
  },
  {
    id: 1008,
    userId: 1008,
    fullName: 'Dr. Asif Iqbal, MD, MPH, PhD',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80',
    coverUrl: campusHeroImg,
    batchYear: 12,
    session: '2002-03 (Batch 12)',
    group: 'Public Health & Epidemiology',
    collegeRoll: 'SZMC-12-058',
    profession: 'Global Health Epidemiologist & WHO Consultant',
    position: 'Senior Epidemiologist & Infectious Disease Lead',
    institution: 'World Health Organization (WHO) Headquarters',
    city: 'Geneva',
    country: 'Switzerland',
    specialty: ['Epidemic Preparedness', 'Vaccine Effectiveness', 'Global Surveillance'],
    degree: ['MBBS (SZMC, Batch 12)', 'MPH (Johns Hopkins Bloomberg School of Public Health)', 'PhD in Epidemiology (Karolinska Institutet)'],
    badges: ['SZMC Batch 12', 'WHO Expert', 'Global Health Researcher'],
    bio: 'Bridged clinical training at SZMC Bogura with global epidemiology. Co-authored landmark WHO guidelines on infectious disease outbreak control.',
    careerHistory: [
      'Epidemiologist, Health Emergencies Programme, WHO Geneva',
      'Postdoctoral Fellow, Karolinska Institutet, Sweden',
      'Former Research Medical Officer, icddr,b Dhaka',
      'Published in The Lancet and New England Journal of Medicine'
    ],
    isPublic: true,
    online: true,
    postsCount: 25,
  },
  {
    id: 1009,
    userId: 1009,
    fullName: 'Dr. Nusrat Jahan, MRCOG (UK), CCT',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80',
    coverUrl: campusHeroImg,
    batchYear: 14,
    session: '2004-05 (Batch 14)',
    group: 'Fetal Medicine & Obstetrics',
    collegeRoll: 'SZMC-14-045',
    profession: 'Consultant Obstetrician & Fetal Medicine Specialist',
    position: 'Consultant Obstetrician',
    institution: 'Cambridge University Hospitals NHS Foundation Trust (Addenbrooke’s)',
    city: 'Cambridge',
    country: 'United Kingdom',
    specialty: ['Fetal Medicine Ultrasound', 'Prenatal Diagnosis', 'Advanced Labour Ward Management'],
    degree: ['MBBS (SZMC, Batch 14)', 'MRCOG (Royal College of Obstetricians & Gynaecologists, UK)', 'Diploma in Advanced Fetal Ultrasound (RCOG)'],
    badges: ['SZMC Batch 14', 'MRCOG UK', 'NHS Consultant'],
    bio: 'Trained at SZMC before undertaking postgraduate training in the UK East of England deanery. Specializes in fetal medicine and prenatal diagnostics at Addenbrooke’s Hospital.',
    careerHistory: [
      'Consultant Obstetrician, Addenbrooke’s Hospital, Cambridge, UK',
      'Honorary Lecturer, University of Cambridge School of Clinical Medicine',
      'Member, Royal College of Obstetricians and Gynaecologists (RCOG)',
      'Organizes mentorship calls for SZMC female doctors aspiring to train abroad'
    ],
    isPublic: true,
    online: false,
    postsCount: 15,
  },
  {
    id: 1010,
    userId: 1010,
    fullName: 'Dr. Reaz Mahmud, FCPS, MD (Neurology)',
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&auto=format&fit=crop&q=80',
    coverUrl: campusHeroImg,
    batchYear: 15,
    session: '2005-06 (Batch 15)',
    group: 'Neurology & Stroke Medicine',
    collegeRoll: 'SZMC-15-021',
    profession: 'Associate Professor of Neurology',
    position: 'Head of Stroke Care Unit & Clinical Neurologist',
    institution: 'Shaheed Ziaur Rahman Medical College (SZMC Bogura)',
    city: 'Bogura',
    country: 'Bangladesh',
    specialty: ['Acute Stroke Thrombolysis', 'Epilepsy Management', 'Movement Disorders & Parkinson’s'],
    degree: ['MBBS (SZMC, Batch 15)', 'FCPS (Medicine)', 'MD (Neurology)'],
    badges: ['SZMC Batch 15', 'Stroke Unit Head', 'SZMC Faculty'],
    bio: 'Passionate faculty member returning to his alma mater SZMC to lead modern stroke thrombolysis interventions in the northern region.',
    careerHistory: [
      'Associate Professor of Neurology, SZMC Bogura',
      'Founder, SZMCH Acute Stroke Thrombolysis Pathway',
      'Life Member, Society of Neurologists of Bangladesh',
      'Author of multiple clinical trials on acute neurological management'
    ],
    isPublic: true,
    online: true,
    postsCount: 20,
  },
  {
    id: 1011,
    userId: 1011,
    fullName: 'Dr. Mehedi Hasan, MD (Critical Care)',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
    coverUrl: campusHeroImg,
    batchYear: 18,
    session: '2008-09 (Batch 18)',
    group: 'Critical Care & Anesthesia',
    collegeRoll: 'SZMC-18-052',
    profession: 'Assistant Professor of Critical Care Medicine',
    position: 'ICU Clinical In-Charge',
    institution: 'Shaheed Ziaur Rahman Medical College Hospital (SZMCH)',
    city: 'Bogura',
    country: 'Bangladesh',
    specialty: ['Mechanical Ventilation', 'Sepsis Resuscitation', 'Hemodynamic Monitoring'],
    degree: ['MBBS (SZMC, Batch 18)', 'MD (Critical Care Medicine, BSMMU)', 'EDIC (European Society of Intensive Care)'],
    badges: ['SZMC Batch 18', 'Critical Care Specialist', 'ICU Director'],
    bio: 'Dedicated intensive care physician leading the central ICU at SZMCH. Instrumental in organizing northern Bangladesh critical care symposia.',
    careerHistory: [
      'Assistant Professor of Critical Care Medicine, SZMCH Bogura',
      'Fellow, European Society of Intensive Care Medicine (ESICM)',
      'Member, Bangladesh Society of Critical Care Medicine',
      'Training coordinator for postgraduate ICU residents'
    ],
    isPublic: true,
    online: false,
    postsCount: 13,
  },
  {
    id: 1012,
    userId: 1012,
    fullName: 'Dr. Samia Chowdhury, MS (Ophthalmology)',
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&auto=format&fit=crop&q=80',
    coverUrl: campusHeroImg,
    batchYear: 20,
    session: '2010-11 (Batch 20)',
    group: 'Ophthalmology & Vitreo-Retina',
    collegeRoll: 'SZMC-20-035',
    profession: 'Consultant Vitreo-Retinal Surgeon',
    position: 'Consultant Eye Surgeon',
    institution: 'National Institute of Ophthalmology & Hospital (NIO&H)',
    city: 'Dhaka',
    country: 'Bangladesh',
    specialty: ['Diabetic Retinopathy', 'Retinal Detachment Surgery', 'Phacoemulsification'],
    degree: ['MBBS (SZMC, Batch 20)', 'MS (Ophthalmology)', 'Fellowship in Vitreo-Retina (Sankara Nethralaya)'],
    badges: ['SZMC Batch 20', 'Retina Surgeon', 'Eye Specialist'],
    bio: 'Accomplished vitreo-retinal surgeon trained at premier eye institutes. Regular contributor to free eye surgery camps organized by SZMC alumni in rural Bogura.',
    careerHistory: [
      'Consultant, Department of Vitreo-Retina, NIO&H Dhaka',
      'Fellow, Vitreo-Retinal Surgery, Sankara Nethralaya, India',
      'Member, Ophthalmological Society of Bangladesh (OSB)',
      'SZMC Batch 20 General Secretary'
    ],
    isPublic: true,
    online: true,
    postsCount: 17,
  }
];

export const FeaturedAlumniSection: React.FC<FeaturedAlumniSectionProps> = ({
  alumniList,
  onSelectAlumnus,
  onExploreDirectory,
}) => {
  const [activeCategory, setActiveCategory] = useState<EliteCategory>('all');
  const [isAutoScrolling, setIsAutoScrolling] = useState<boolean>(true);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const carouselRef = useRef<HTMLDivElement>(null);

  // Combine prominent SZMC doctors with any registered profiles
  const allProminentAlumni = useMemo(() => {
    const combined = [...FAMOUS_SZMC_ALUMNI];
    if (alumniList && alumniList.length > 0) {
      alumniList.forEach((userAlumnus, idx) => {
        const sameName = combined.some(
          (p) => p.fullName.toLowerCase() === userAlumnus.fullName.toLowerCase()
        );
        if (!sameName) {
          const hasSameId = combined.some((p) => p.id === userAlumnus.id);
          combined.push(
            hasSameId
              ? { ...userAlumnus, id: 700000 + userAlumnus.id + idx }
              : userAlumnus
          );
        }
      });
    }
    return combined;
  }, [alumniList]);

  // Filter based on active career category
  const filteredAlumni = useMemo(() => {
    switch (activeCategory) {
      case 'surgery':
        return allProminentAlumni.filter(
          (a) =>
            a.profession?.toLowerCase().includes('surgeon') ||
            a.profession?.toLowerCase().includes('surgery') ||
            a.profession?.toLowerCase().includes('ortho') ||
            a.position?.toLowerCase().includes('surgery') ||
            a.position?.toLowerCase().includes('ortho') ||
            a.group?.toLowerCase().includes('surgery') ||
            a.specialty?.some((s) => s.toLowerCase().includes('surg') || s.toLowerCase().includes('ortho') || s.toLowerCase().includes('trauma'))
        );
      case 'medicine':
        return allProminentAlumni.filter(
          (a) =>
            a.profession?.toLowerCase().includes('cardio') ||
            a.profession?.toLowerCase().includes('medicine') ||
            a.profession?.toLowerCase().includes('neuro') ||
            a.position?.toLowerCase().includes('cardio') ||
            a.position?.toLowerCase().includes('medicine') ||
            a.specialty?.some((s) => s.toLowerCase().includes('cardio') || s.toLowerCase().includes('heart') || s.toLowerCase().includes('stroke') || s.toLowerCase().includes('medicine'))
        );
      case 'pediatrics':
        return allProminentAlumni.filter(
          (a) =>
            a.profession?.toLowerCase().includes('pediatric') ||
            a.profession?.toLowerCase().includes('gynae') ||
            a.profession?.toLowerCase().includes('obstetric') ||
            a.group?.toLowerCase().includes('pediatric') ||
            a.group?.toLowerCase().includes('gynaecology') ||
            a.specialty?.some((s) => s.toLowerCase().includes('pediatric') || s.toLowerCase().includes('maternal') || s.toLowerCase().includes('fetal'))
        );
      case 'academia':
        return allProminentAlumni.filter(
          (a) =>
            a.profession?.toLowerCase().includes('professor') ||
            a.position?.toLowerCase().includes('professor') ||
            a.position?.toLowerCase().includes('dean') ||
            a.position?.toLowerCase().includes('head') ||
            a.badges?.some((b) => b.toLowerCase().includes('faculty'))
        );
      case 'global':
        return allProminentAlumni.filter(
          (a) =>
            a.country && a.country.toLowerCase() !== 'bangladesh'
        );
      case 'all':
      default:
        return allProminentAlumni;
    }
  }, [activeCategory, allProminentAlumni]);

  // Smooth continuous auto-scrolling effect
  useEffect(() => {
    const container = carouselRef.current;
    if (!container) return;

    let animationFrameId: number;
    const speed = 0.8; // px per tick

    const step = () => {
      if (isAutoScrolling && !isHovered && container) {
        // If reached end, smoothly loop back to start
        if (container.scrollLeft >= container.scrollWidth - container.clientWidth - 1) {
          container.scrollLeft = 0;
        } else {
          container.scrollLeft += speed;
        }
      }
      animationFrameId = requestAnimationFrame(step);
    };

    animationFrameId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isAutoScrolling, isHovered, filteredAlumni]);

  const handleManualScroll = (direction: 'left' | 'right') => {
    const container = carouselRef.current;
    if (!container) return;
    const scrollAmount = 360; // Card width approx
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  return (
    <section className="py-5 sm:py-8 lg:py-12 max-w-7xl mx-auto px-4 sm:px-6">
      {/* Section Header */}
      <ScrollReveal>
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-3.5 sm:mb-6 gap-3 sm:gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1.5">
              <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-600 dark:text-blue-400" />
              <span>DISTINGUISHED DOCTORS • SZMC LEADERS</span>
            </div>
            <h2 className="text-xl sm:text-3xl lg:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
              Prominent Doctors & Faculty from 35 Batches
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5 max-w-2xl">
              From Pioneer Batch 01 (1992) consultants to professors, NHS clinical leads, surgeons, and young post-graduate doctors—celebrating SZMCians who heal and lead worldwide.
            </p>
          </div>

          {/* Filter Pills with mobile horizontal scroll */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto max-w-full no-scrollbar pb-1.5 sm:pb-1.5 md:flex-wrap self-start md:self-auto -mx-4 px-4 sm:mx-0 sm:px-1.5">
            {[
              { id: 'all', label: 'All Doctors' },
              { id: 'surgery', label: 'Surgery & Orthopedics' },
              { id: 'medicine', label: 'Medicine & Cardiology' },
              { id: 'pediatrics', label: 'Pediatrics & Gynae' },
              { id: 'academia', label: 'Professors & Faculty' },
              { id: 'global', label: 'Global Diaspora (UK/USA)' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategory(tab.id as EliteCategory)}
                className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  activeCategory === tab.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </ScrollReveal>

      {/* Interactive Auto-Scroll Controls & Status Bar */}
      <div className="flex items-center justify-between mb-3 sm:mb-4 px-1 text-xs">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setIsAutoScrolling(!isAutoScrolling)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer ${
              isAutoScrolling
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
            title={isAutoScrolling ? 'Click to pause auto-scrolling' : 'Click to resume auto-scrolling'}
          >
            {isAutoScrolling ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isAutoScrolling ? 'Auto-Scrolling Active' : 'Auto-Scroll Paused'}</span>
          </button>
          <span className="text-slate-400 text-[11px]">
            {filteredAlumni.length} Leaders
          </span>
        </div>

        {/* Manual Left / Right Navigation Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleManualScroll('left')}
            className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer shadow-xs"
            aria-label="Scroll left"
            title="Scroll Left"
          >
            <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleManualScroll('right')}
            className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer shadow-xs"
            aria-label="Scroll right"
            title="Scroll Right"
          >
            <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </div>

      {/* Auto-scrolling Interactive Carousel Container */}
      <div
        ref={carouselRef}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="flex gap-3 sm:gap-5 overflow-x-auto pb-3 sm:pb-4 pt-1 sm:pt-2 no-scrollbar scroll-smooth cursor-grab active:cursor-grabbing select-none"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {filteredAlumni.map((alumnus, idx) => (
          <Tilt3DCard
            key={`${alumnus.id}-${idx}`}
            onClick={() => onSelectAlumnus(alumnus)}
            className="w-[82vw] min-[360px]:w-[280px] sm:w-[320px] lg:w-[350px] max-w-[340px] shrink-0 group glass-card rounded-2xl sm:rounded-3xl p-4 sm:p-5 cursor-pointer flex flex-col justify-between"
          >
            <div>
              {/* Profile Picture Header & Badges */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="relative">
                  <img
                    src={alumnus.avatarUrl}
                    alt={alumnus.fullName}
                    className="avatar-interactive w-18 h-18 rounded-2xl object-cover border-2 border-slate-100 dark:border-slate-800 shadow-md bg-slate-100 dark:bg-slate-800"
                  />
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
                </div>

                <div className="flex flex-col items-end gap-1.5">
                  <span className="px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 text-[11px] font-black tracking-tight">
                    Batch {alumnus.batchYear < 10 ? `0${alumnus.batchYear}` : alumnus.batchYear}
                  </span>
                  {alumnus.country && (
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold">
                      {alumnus.country}
                    </span>
                  )}
                </div>
              </div>

              {/* Identity & Career Position */}
              <div className="space-y-1.5 mb-3">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-base font-black text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                    {alumnus.fullName}
                  </h3>
                  <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                </div>

                {/* Top Carrier Position Badge */}
                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 text-xs font-bold leading-tight">
                  <Briefcase className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="line-clamp-1">{alumnus.position}</span>
                </div>

                {/* Institution & Location */}
                <p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5 line-clamp-1 font-medium mt-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{alumnus.institution}</span>
                </p>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{[alumnus.city, alumnus.country].filter(Boolean).join(', ')}</span>
                </p>
              </div>

              {/* Career Highlights / Specialties */}
              <div className="flex flex-wrap gap-1 mb-4">
                {alumnus.badges?.slice(0, 2).map((b) => (
                  <span
                    key={b}
                    className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-[10px] font-bold border border-blue-200/60 dark:border-blue-900/40"
                  >
                    {b}
                  </span>
                ))}
                {alumnus.specialty?.slice(0, 1).map((s) => (
                  <span
                    key={s}
                    className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-medium truncate max-w-[200px]"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Quick Profile View Action */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300">
              <span className="flex items-center gap-1">
                <span>View Full Career Bio</span>
              </span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Tilt3DCard>
        ))}
      </div>

      {/* Directory CTA */}
      <div className="text-center mt-10">
        <MagneticWrap>
          <button
            type="button"
            onClick={onExploreDirectory}
            className="btn-interactive inline-flex items-center gap-2 px-6 py-3 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white text-xs sm:text-sm font-bold rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-all cursor-pointer"
          >
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Search All 35,000+ Alumni in Directory</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </MagneticWrap>
      </div>
    </section>
  );
};

