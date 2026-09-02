// lib/scoreRequirementsData.js
//
// Per-country IELTS requirement data for /ielts-score-requirements/<country>.
//
// PROVENANCE: every band, level and "no requirement is set" statement below was
// read off the linked page on 2 September 2026. Nothing here is from memory, and
// nothing is from an aggregator or study-abroad agency — only immigration
// authorities, professional regulators and universities' own admissions pages.
//
// THE PUBLISHING RULE: a row without a `sources` entry is an unsourced claim
// about somebody else's requirements, so lib/scoreRequirementsData.test.js
// fails the build if any row has none. When you update a figure, update
// `verifiedOn` and the source link in the same edit — a fresh number behind a
// stale date is worse than an old number honestly dated.
//
// A "no national requirement" row is a real finding, not a gap: Canada, the
// United States, New Zealand, Germany, the Netherlands, the UAE and Singapore
// genuinely leave the student-visa English standard to the institution, and
// saying so is more useful than inventing a number.
//
// Figures are typical published minimums. Individual programmes routinely ask
// for more, and requirements change without notice — every page tells the
// reader to confirm against the linked source.

export const SCORE_REQUIREMENT_COUNTRIES = [
  {
    "slug": "united-kingdom",
    "name": "the United Kingdom",
    "shortName": "the UK",
    "verifiedOn": "2 September 2026",
    "answer": "There is no single UK IELTS score. For a Student visa the Home Office sets a CEFR level rather than a band — B2 for degree-level study and B1 below it — while universities set their own entry requirements, typically 6.5 overall with 6.0 in each component, rising to 7.5 overall at Cambridge. Nurses registering with the NMC need 7.0 in reading, listening and speaking with 6.5 in writing. Confirm the figure on the official page for your route, as these change.",
    "purposes": [
      {
        "purpose": "Student visa",
        "band": "CEFR B2 for degree-level courses; CEFR B1 below degree level",
        "notes": "The Home Office sets the requirement as a CEFR level, not an IELTS band; the equivalent IELTS score depends on the approved SELT provider.",
        "sources": [
          {
            "label": "GOV.UK — Student visa: knowledge of English",
            "url": "https://www.gov.uk/student-visa/knowledge-of-english"
          }
        ]
      },
      {
        "purpose": "Skilled migration / work visa",
        "band": "CEFR B2",
        "notes": "Skilled Worker applicants must read, write, speak and understand English to at least CEFR B2; those extending a visa obtained before 8 January 2026 need only B1.",
        "sources": [
          {
            "label": "GOV.UK — Skilled Worker visa: knowledge of English",
            "url": "https://www.gov.uk/skilled-worker-visa/knowledge-of-english"
          }
        ]
      },
      {
        "purpose": "Undergraduate study",
        "band": "Typically 6.5 overall with 6.0 in each component",
        "notes": "Set by each university, not nationally — 6.5/6.0 is the lowest institution-wide level published by UCL, Imperial and King's, while Cambridge asks for 7.5 overall.",
        "sources": [
          {
            "label": "UCL — English language requirements (undergraduate)",
            "url": "https://www.ucl.ac.uk/study/prospective-students/undergraduate/how-apply/english-language-requirements"
          },
          {
            "label": "Imperial College London — English language requirements",
            "url": "https://www.imperial.ac.uk/study/apply/english-language/"
          },
          {
            "label": "King's College London — Undergraduate English language entry requirements",
            "url": "https://www.kcl.ac.uk/study/undergraduate/how-to-apply/english-language-requirements"
          }
        ]
      },
      {
        "purpose": "Postgraduate study",
        "band": "Typically 6.5–7.0 overall with 6.0–6.5 in each component",
        "notes": "Programme-specific: UCL and Imperial both publish a 6.5/6.0 standard level and a 7.0/6.5 higher level for taught postgraduate entry.",
        "sources": [
          {
            "label": "UCL — English language requirements (graduate)",
            "url": "https://www.ucl.ac.uk/prospective-students/graduate/english-language-requirements"
          },
          {
            "label": "Imperial College London — English language requirements",
            "url": "https://www.imperial.ac.uk/study/apply/english-language/"
          }
        ]
      },
      {
        "purpose": "Nursing / medical registration",
        "band": "IELTS Academic: at least 7.0 in reading, listening and speaking, and at least 6.5 in writing",
        "notes": "Nursing and Midwifery Council requirement; no overall band is specified, and scores may be combined across two sittings under NMC rules.",
        "sources": [
          {
            "label": "NMC — IELTS Academic",
            "url": "https://www.nmc.org.uk/registration/joining-the-register/english-language-requirements/accepted-english-language-tests/ielts-academic/"
          }
        ]
      }
    ],
    "universities": [
      {
        "name": "University of Cambridge",
        "undergrad": "7.5 overall, usually with 7.0 or above in each element",
        "postgrad": "Not published as a single institution-wide figure",
        "notes": "Cambridge also recommends at least 6.5 overall with no element below 6.0 at the point of application; postgraduate scores are set per course and were not published on a single page.",
        "sources": [
          {
            "label": "University of Cambridge — Undergraduate entry requirements",
            "url": "https://www.undergraduate.study.cam.ac.uk/apply/before/entry-requirements"
          }
        ]
      },
      {
        "name": "University College London (UCL)",
        "undergrad": "Level 1: 6.5 overall with 6.0 in each component (rising to Level 5: 8.0 overall with 8.0 in each)",
        "postgrad": "Level 1: 6.5 overall with 6.0 in each component (rising to Level 5: 8.0 overall with 8.0 in each)",
        "notes": "UCL uses five levels; the level that applies is programme-specific — Level 2 is 7.0 overall with 6.5 in each component, Level 3 is 7.0 with 7.0, Level 4 is 7.5 with 7.0.",
        "sources": [
          {
            "label": "UCL — English language requirements (undergraduate)",
            "url": "https://www.ucl.ac.uk/study/prospective-students/undergraduate/how-apply/english-language-requirements"
          },
          {
            "label": "UCL — English language requirements (graduate)",
            "url": "https://www.ucl.ac.uk/prospective-students/graduate/english-language-requirements"
          }
        ]
      },
      {
        "name": "Imperial College London",
        "undergrad": "Standard: 6.5 overall (minimum 6.0 in all elements); Higher: 7.0 overall (minimum 6.5 in all elements)",
        "postgrad": "Standard: 6.5 overall (minimum 6.0 in all elements); Higher: 7.0 overall (minimum 6.5 in all elements)",
        "notes": "The same two levels apply to undergraduate and postgraduate courses; which level applies is programme-specific. Scores must be from a single sitting.",
        "sources": [
          {
            "label": "Imperial College London — English language requirements",
            "url": "https://www.imperial.ac.uk/study/apply/english-language/"
          }
        ]
      },
      {
        "name": "King's College London",
        "undergrad": "Band D: 6.5 overall with 6.0 in each skill; Band B: 7.0 overall with 6.5 in each skill; Band A: 7.5 overall with 7.0 in each skill",
        "postgrad": "Not published as a single institution-wide figure",
        "notes": "King's sets a band per course, so these are programme-specific tiers rather than one institution-wide minimum; Band C does not apply to undergraduate courses. The postgraduate band table was on a separate page that was not fetched.",
        "sources": [
          {
            "label": "King's College London — Undergraduate English language entry requirements",
            "url": "https://www.kcl.ac.uk/study/undergraduate/how-to-apply/english-language-requirements"
          }
        ]
      }
    ],
    "faq": [
      {
        "q": "What IELTS score do I need for a UK Student visa?",
        "a": "The Home Office states the requirement as a CEFR level rather than an IELTS band: B2 for degree-level courses and B1 for study below degree level. The equivalent band depends on the approved Secure English Language Test provider, and universities almost always ask for more than the visa minimum, so treat your university’s own requirement as the number to hit. Check gov.uk for your specific route."
      },
      {
        "q": "What IELTS score do UK universities ask for?",
        "a": "Typically 6.5 overall with 6.0 in each component, which was the lowest institution-wide level published by UCL, Imperial and King’s College London when we checked on 2 September 2026. Cambridge asks for 7.5 overall, usually with 7.0 or above in each element. Many universities band their courses, so the level that applies depends on your programme — verify it on the course page."
      },
      {
        "q": "What IELTS score do nurses need for the UK?",
        "a": "The Nursing and Midwifery Council requires IELTS Academic with at least 7.0 in reading, listening and speaking and at least 6.5 in writing. No overall band is specified, and the NMC allows scores to be combined across two sittings under its own rules. Confirm the current requirement with the NMC before booking a test."
      },
      {
        "q": "Do I need IELTS for a Skilled Worker visa?",
        "a": "Skilled Worker applicants must show English to at least CEFR B2, which the Home Office states as a level rather than a band; applicants extending a visa first granted before 8 January 2026 need only B1. An approved Secure English Language Test is one accepted route. Check gov.uk, as the level for this route changed recently."
      }
    ]
  },
  {
    "slug": "canada",
    "name": "Canada",
    "shortName": "Canada",
    "verifiedOn": "2 September 2026",
    "answer": "Canada has no federal IELTS requirement for a study permit — IRCC’s eligibility and required-document lists name no language test, and the school that admits you sets the standard, commonly 6.5 overall with no band below 6.0 at Toronto, UBC and McGill. For economic immigration IRCC works in Canadian Language Benchmarks instead: CLB 7, the Federal Skilled Worker minimum, equals IELTS General Training 6.0 in all four skills. Verify current rules on canada.ca.",
    "purposes": [
      {
        "purpose": "Student visa",
        "band": "No federal IELTS requirement — set by the school you apply to",
        "notes": "IRCC's study permit eligibility and required-documents pages list no language test; proof of language ability is only required by the designated learning institution that admits you.",
        "sources": [
          {
            "label": "IRCC — Study permit: Who can apply",
            "url": "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/eligibility.html"
          },
          {
            "label": "IRCC — Study permit: Get the right documents",
            "url": "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/get-documents.html"
          }
        ]
      },
      {
        "purpose": "Skilled migration / work visa",
        "band": "IELTS General Training 6.0 in each of listening, reading, writing and speaking (CLB 7) for the Federal Skilled Worker Program",
        "notes": "IRCC sets Canadian Language Benchmarks, not IELTS bands; its own equivalency chart maps CLB 7 to 6.0 in all four abilities, CLB 5 to 5.0 speaking / 5.0 listening / 4.0 reading / 5.0 writing, and CLB 4 to 4.0 / 4.5 / 3.5 / 4.0. Canadian Experience Class needs CLB 7 for NOC TEER 0 or 1 jobs and CLB 5 for TEER 2 or 3; Federal Skilled Trades needs CLB 5 speaking and listening, CLB 4 reading and writing.",
        "sources": [
          {
            "label": "IRCC — Express Entry language test results and CLB/IELTS equivalency charts",
            "url": "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/language-requirements.html"
          }
        ]
      },
      {
        "purpose": "Undergraduate study",
        "band": "Typically 6.5 overall with no component below 6.0",
        "notes": "Set by each university — Toronto, UBC and McGill all publish exactly 6.5 overall with 6.0 in every band; Waterloo asks 6.5 overall but 6.5 in writing and speaking.",
        "sources": [
          {
            "label": "University of Toronto — English language requirements",
            "url": "https://future.utoronto.ca/apply/english-language-requirements/"
          },
          {
            "label": "UBC — English language competency",
            "url": "https://you.ubc.ca/applying-ubc/requirements/english-language-competency/"
          },
          {
            "label": "McGill — English language proficiency (undergraduate)",
            "url": "https://www.mcgill.ca/undergraduate-admissions/apply/english-proficiency"
          }
        ]
      },
      {
        "purpose": "Postgraduate study",
        "band": "Typically 6.5 overall, commonly with no component below 6.0",
        "notes": "Programme-specific: UBC's graduate school sets 6.5 overall with 6.0 in each component and McGill's graduate minimum is 6.5 overall, but individual programmes may set higher thresholds.",
        "sources": [
          {
            "label": "UBC Graduate and Postdoctoral Studies — English proficiency requirements",
            "url": "https://www.grad.ubc.ca/prospective-students/application-admission/english-proficiency-requirements"
          },
          {
            "label": "McGill — English language proficiency (graduate)",
            "url": "https://www.mcgill.ca/gradapplicants/how-apply/you-apply-mcgill/proficiency"
          }
        ]
      },
      {
        "purpose": "Nursing / medical registration",
        "band": "IELTS 7.0 overall, with 7.0 listening, 7.0 speaking, 6.5 reading and 6.5 writing",
        "notes": "Provincial rather than national — these are the College of Nurses of Ontario benchmarks; CNO accepts both Academic and General Training, and other provinces set their own scores.",
        "sources": [
          {
            "label": "College of Nurses of Ontario — Proficiency in English or French",
            "url": "https://www.cno.org/en/become-a-nurse/registration-requirements/language-proficiency/"
          }
        ]
      }
    ],
    "universities": [
      {
        "name": "University of Toronto",
        "undergrad": "6.5 overall, with no band below 6.0",
        "postgrad": "Not published as a single institution-wide figure",
        "notes": "Institution-wide undergraduate minimum; graduate requirements are set by each graduate unit and were not read from a single page.",
        "sources": [
          {
            "label": "University of Toronto — English language requirements",
            "url": "https://future.utoronto.ca/apply/english-language-requirements/"
          }
        ]
      },
      {
        "name": "University of British Columbia",
        "undergrad": "6.5 overall, with no part less than 6.0",
        "postgrad": "6.5 overall, with a minimum of 6.0 in each component",
        "notes": "Graduate figure is the Faculty of Graduate and Postdoctoral Studies floor; individual graduate programmes may require more.",
        "sources": [
          {
            "label": "UBC — English language competency",
            "url": "https://you.ubc.ca/applying-ubc/requirements/english-language-competency/"
          },
          {
            "label": "UBC Graduate and Postdoctoral Studies — English proficiency requirements",
            "url": "https://www.grad.ubc.ca/prospective-students/application-admission/english-proficiency-requirements"
          }
        ]
      },
      {
        "name": "McGill University",
        "undergrad": "6.5 overall, with individual component scores of 6.0 or better",
        "postgrad": "6.5 overall (Academic module)",
        "notes": "McGill accepts IELTS Academic and IELTS for UKVI but not the One Skill Retake.",
        "sources": [
          {
            "label": "McGill — English language proficiency (undergraduate)",
            "url": "https://www.mcgill.ca/undergraduate-admissions/apply/english-proficiency"
          },
          {
            "label": "McGill — English language proficiency (graduate)",
            "url": "https://www.mcgill.ca/gradapplicants/how-apply/you-apply-mcgill/proficiency"
          }
        ]
      },
      {
        "name": "University of Waterloo",
        "undergrad": "6.5 overall, with 6.5 writing, 6.5 speaking, 6.0 reading and 6.0 listening",
        "postgrad": "Not published as a single institution-wide figure",
        "notes": "Waterloo also accepts 7.0 overall with 6.0 or better in every component; the page covers undergraduate admission only.",
        "sources": [
          {
            "label": "University of Waterloo — English language requirements",
            "url": "https://uwaterloo.ca/future-students/admissions/english-language-requirements"
          }
        ]
      }
    ],
    "faq": [
      {
        "q": "What IELTS score do I need for a Canadian study permit?",
        "a": "IRCC does not set one. Its study permit eligibility and required-documents pages list no language test; proof of language ability is required by the designated learning institution that admits you, not by the visa itself. In practice that means your university’s requirement — commonly 6.5 overall with 6.0 in each band — is the number that matters."
      },
      {
        "q": "What is CLB 7 in IELTS?",
        "a": "On IRCC’s own equivalency chart, CLB 7 corresponds to IELTS General Training 6.0 in each of listening, reading, writing and speaking. CLB 7 is the language minimum for the Federal Skilled Worker Program and for Canadian Experience Class applicants in NOC TEER 0 or 1 jobs, while TEER 2 and 3 jobs need CLB 5."
      },
      {
        "q": "Does Canada PR accept IELTS Academic?",
        "a": "Express Entry economic programmes use the General Training module, while universities ask for Academic. The two are not interchangeable for immigration purposes, so check which module your programme requires on canada.ca before you book a test."
      },
      {
        "q": "What IELTS score do nurses need in Canada?",
        "a": "Nursing registration is provincial rather than federal. The College of Nurses of Ontario, for example, requires 7.0 overall with 7.0 in listening and speaking and 6.5 in reading and writing, and accepts both Academic and General Training. Other provinces set their own scores, so check the regulator for the province you are moving to."
      }
    ]
  },
  {
    "slug": "australia",
    "name": "Australia",
    "shortName": "Australia",
    "verifiedOn": "2 September 2026",
    "answer": "The Department of Home Affairs sets 6.0 overall for a Subclass 500 Student visa, dropping to 5.5 when the course is packaged with at least 10 weeks of ELICOS and 5.0 with 20 weeks. Skilled visas usually require Competent English — at least 6 in every component — with higher levels earning extra points. Universities typically ask 6.5 overall with no band below 6.0, and Ahpra-registered nurses need 7.0 overall with 6.5 in writing. Confirm current figures with the relevant authority.",
    "purposes": [
      {
        "purpose": "Student visa",
        "band": "6.0 overall (IELTS Academic or General Training)",
        "notes": "Home Affairs drops the minimum to 5.5 if the principal course is packaged with at least 10 weeks of ELICOS, a Foundation program or an eligible Pathway program, and to 5.0 with at least 20 weeks of ELICOS.",
        "sources": [
          {
            "label": "Department of Home Affairs — Subclass 500 Student visa (Step by step: Gather your documents)",
            "url": "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500"
          }
        ]
      },
      {
        "purpose": "Skilled migration / work visa",
        "band": "Competent English — at least 6 in each of listening, reading, writing and speaking",
        "notes": "Home Affairs sets named English levels rather than one visa-wide band; Competent English is the usual threshold for skilled visas and both IELTS Academic and IELTS General Training count, with higher levels (Proficient, Superior) earning extra points.",
        "sources": [
          {
            "label": "Department of Home Affairs — Competent English",
            "url": "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/english-language/competent-english"
          },
          {
            "label": "Department of Home Affairs — English language visa requirements",
            "url": "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/english-language"
          }
        ]
      },
      {
        "purpose": "Undergraduate study",
        "band": "Typically 6.5 overall with no band below 6.0",
        "notes": "Set by each university — Melbourne's Level 1, Sydney's standard requirement and Monash's minimum are all 6.5 overall with 6.0 in every band; more competitive faculties go higher.",
        "sources": [
          {
            "label": "University of Melbourne — English language requirements",
            "url": "https://study.unimelb.edu.au/how-to-apply/english-language-requirements"
          },
          {
            "label": "University of Sydney — English language requirements",
            "url": "https://www.sydney.edu.au/study/applying/how-to-apply/international-students/english-language-requirements.html"
          },
          {
            "label": "Monash University — English language requirements",
            "url": "https://www.monash.edu/admissions/entry-requirements/english-language"
          }
        ]
      },
      {
        "purpose": "Postgraduate study",
        "band": "Typically 6.5–7.0 overall with no band below 6.0",
        "notes": "Programme-specific: Sydney's standard postgraduate coursework requirement is 6.5 with no band below 6.0, while UNSW Business asks 7.0 overall and Melbourne's Level 2 is 7.0 overall with 6.5 in each band.",
        "sources": [
          {
            "label": "University of Sydney — English language requirements",
            "url": "https://www.sydney.edu.au/study/applying/how-to-apply/international-students/english-language-requirements.html"
          },
          {
            "label": "UNSW Sydney — English language requirements",
            "url": "https://www.unsw.edu.au/study/how-to-apply/english-language-requirements"
          },
          {
            "label": "University of Melbourne — English language requirements",
            "url": "https://study.unimelb.edu.au/how-to-apply/english-language-requirements"
          }
        ]
      },
      {
        "purpose": "Nursing / medical registration",
        "band": "IELTS Academic 7.0 overall, with 7.0 listening, 7.0 reading, 7.0 speaking and 6.5 writing",
        "notes": "Ahpra's National Boards updated the minimum scores on 23 April 2026; the IELTS requirement itself is unchanged, and results from two sittings within 12 months can be combined subject to conditions.",
        "sources": [
          {
            "label": "Ahpra — Accepted English language tests",
            "url": "https://www.ahpra.gov.au/Registration/Registration-Standards/English-language-skills/Accepted-English-language-tests"
          }
        ]
      }
    ],
    "universities": [
      {
        "name": "University of Melbourne",
        "undergrad": "Level 1: 6.5 overall with at least 6.0 in writing, speaking, reading and listening",
        "postgrad": "Level 2: 7.0 overall with at least 6.5 in each component",
        "notes": "Melbourne publishes graded levels (1, 1a, 1b, 2, 2a, 2b) and each course is assigned one, so the level is programme-specific; Level 1b is 6.5 overall with 6.5 in every band.",
        "sources": [
          {
            "label": "University of Melbourne — English language requirements",
            "url": "https://study.unimelb.edu.au/how-to-apply/english-language-requirements"
          }
        ]
      },
      {
        "name": "University of Sydney",
        "undergrad": "6.5 overall with no band below 6.0",
        "postgrad": "6.5 overall with no band below 6.0",
        "notes": "This is the standard university requirement; the page notes some faculties and courses (for example nursing) set higher scores.",
        "sources": [
          {
            "label": "University of Sydney — English language requirements",
            "url": "https://www.sydney.edu.au/study/applying/how-to-apply/international-students/english-language-requirements.html"
          }
        ]
      },
      {
        "name": "UNSW Sydney",
        "undergrad": "6.5 overall (min. 6.0 in each subtest) for Arts, Design & Architecture and for Engineering; 7.0 overall (min. 6.0 in each subtest) for Business",
        "postgrad": "6.5 overall (min. 6.0 in each subtest) for Arts, Design & Architecture and for Engineering; 7.0 overall (min. 6.0 in each subtest) for Business",
        "notes": "Faculty-specific rather than institution-wide — UNSW lists a requirement per faculty, and Education and Social Work programmes sit higher again.",
        "sources": [
          {
            "label": "UNSW Sydney — English language requirements",
            "url": "https://www.unsw.edu.au/study/how-to-apply/english-language-requirements"
          }
        ]
      },
      {
        "name": "Monash University",
        "undergrad": "6.5 overall with reading 6.0, listening 6.0, writing 6.0 and speaking 6.0",
        "postgrad": "6.5 overall with reading 6.0, listening 6.0, writing 6.0 and speaking 6.0",
        "notes": "Monash publishes a single minimum English test score table described as the University's minimum; individual courses can require higher scores.",
        "sources": [
          {
            "label": "Monash University — English language requirements",
            "url": "https://www.monash.edu/admissions/entry-requirements/english-language"
          }
        ]
      }
    ],
    "faq": [
      {
        "q": "What IELTS score do I need for an Australian student visa?",
        "a": "Home Affairs sets 6.0 overall for the Subclass 500 Student visa, and either IELTS Academic or General Training is accepted. The minimum falls to 5.5 if your principal course is packaged with at least 10 weeks of ELICOS, a Foundation program or an eligible Pathway program, and to 5.0 with at least 20 weeks of ELICOS. Your university will usually ask for more than the visa minimum."
      },
      {
        "q": "What is Competent English?",
        "a": "Competent English is the Department of Home Affairs level used for most skilled visas: at least 6 in each of listening, reading, writing and speaking. Both IELTS Academic and General Training count towards it. The higher named levels, Proficient and Superior, earn additional points in the skilled migration points test."
      },
      {
        "q": "What IELTS score do Australian universities require?",
        "a": "Typically 6.5 overall with no band below 6.0, which was the standard published by Melbourne (Level 1), Sydney and Monash when we checked. Competitive and professional programmes go higher — Melbourne’s Level 2 is 7.0 overall with 6.5 in each band, and UNSW Business asks 7.0 overall. Check the requirement for your exact course."
      },
      {
        "q": "What IELTS score do nurses need in Australia?",
        "a": "Ahpra’s National Boards require IELTS Academic with 7.0 overall and at least 7.0 in listening, reading and speaking and 6.5 in writing. Results from two sittings within 12 months can be combined subject to conditions. Ahpra updated its accepted-test scores in April 2026, so check the current standard before you sit."
      }
    ]
  },
  {
    "slug": "united-states",
    "name": "the United States",
    "shortName": "the US",
    "verifiedOn": "2 September 2026",
    "answer": "There is no federal IELTS requirement to study or work in the United States. The Student and Exchange Visitor Program says outright that it does not regulate how well an international student must speak the language; the SEVP-certified school that admits you sets the standard, and published minimums are unusually wide — typically 6.5 to 7.5 overall, from Purdue at 6.5 to Columbia at 7.5. Health care workers are the exception, needing 6.5 overall with 7 in speaking for VisaScreen.",
    "purposes": [
      {
        "purpose": "Student visa",
        "band": "No federal IELTS requirement — set by the school that admits you",
        "notes": "The Student and Exchange Visitor Program states it 'does not regulate how well an international student must speak the language'; SEVP-certified schools set their own English standards and a Form I-20 can only be issued once those are met.",
        "sources": [
          {
            "label": "DHS Study in the States — Do I Need to Pass an English Language Test to Study in the United States?",
            "url": "https://studyinthestates.dhs.gov/2016/01/do-i-need-pass-english-language-test-study-united-states"
          },
          {
            "label": "DHS Study in the States — English Language Training",
            "url": "https://studyinthestates.dhs.gov/students/get-started/english-language-training"
          }
        ]
      },
      {
        "purpose": "Skilled migration / work visa",
        "band": "No federal IELTS requirement",
        "notes": "USCIS's H-1B specialty occupation criteria are about degrees, licensure and experience and include no English language test; the exception is health care workers, who must pass an approved English test for the VisaScreen certificate.",
        "sources": [
          {
            "label": "USCIS — H-1B Specialty Occupations",
            "url": "https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations"
          },
          {
            "label": "HRSA — Updated list of Tests and Scores for Foreign Health Care Workers",
            "url": "https://www.hrsa.gov/office-global-health/foreign-healthcare-worker-requirements"
          }
        ]
      },
      {
        "purpose": "Undergraduate study",
        "band": "Typically 6.5–7.5 overall",
        "notes": "Entirely institution-set and the spread is wide: Purdue asks 6.5 with 6.0 in each section, Boston University 7.0 overall, MIT a minimum of 7 (7.5 recommended) and Columbia 7.5.",
        "sources": [
          {
            "label": "Purdue University — English Proficiency Requirements (undergraduate)",
            "url": "https://admissions.purdue.edu/become-student/english-proficiency/"
          },
          {
            "label": "Boston University — International Applicants",
            "url": "https://www.bu.edu/admissions/apply/international/"
          },
          {
            "label": "MIT Admissions — Tests & scores",
            "url": "https://mitadmissions.org/apply/firstyear/tests-scores/"
          },
          {
            "label": "Columbia Undergraduate Admissions — English Proficiency Requirements",
            "url": "https://undergrad.admissions.columbia.edu/apply/international/english-proficiency"
          }
        ]
      },
      {
        "purpose": "Postgraduate study",
        "band": "Typically 6.5–7.5 overall",
        "notes": "Programme-specific: Purdue's Graduate School floor is 6.5 overall, MIT's Office of Graduate Education recommends at least 7 (departments can require more), and Columbia GSAS requires 7.5.",
        "sources": [
          {
            "label": "Purdue Graduate School — English Proficiency Requirements",
            "url": "https://www.purdue.edu/gradschool/admissions/how-to-apply/apply-toefl.html"
          },
          {
            "label": "MIT Office of Graduate Education — IELTS",
            "url": "https://oge.mit.edu/graduate-admissions/applications/standardized-tests/ielts/"
          },
          {
            "label": "Columbia GSAS — Information for International Applicants",
            "url": "https://gsas.columbia.edu/degree-programs/admissions/information-international-applicants"
          }
        ]
      },
      {
        "purpose": "Nursing / medical registration",
        "band": "IELTS 6.5 overall with at least 7 in speaking (registered nurses and other B.S.-level health care workers)",
        "notes": "This is the federal VisaScreen standard set by HRSA and applied by CGFNS/TruMerit for an occupational visa; below-B.S.-level health care workers need 6 overall with 7 speaking, and individual state boards of nursing may add their own requirements.",
        "sources": [
          {
            "label": "HRSA — Updated list of Tests and Scores for Foreign Health Care Workers (as of May 12, 2026)",
            "url": "https://www.hrsa.gov/office-global-health/foreign-healthcare-worker-requirements"
          },
          {
            "label": "CGFNS/TruMerit — Applying for VisaScreen",
            "url": "https://www.cgfns.org/faq/visascreen/applying-for-visascreen-visascreen-credentials-assessment/"
          }
        ]
      }
    ],
    "universities": [
      {
        "name": "Massachusetts Institute of Technology",
        "undergrad": "Minimum 7; recommended 7.5",
        "postgrad": "GradAdmissions recommends a minimum score of at least 7",
        "notes": "The graduate figure is a school-wide recommendation only — MIT states that department minimum scores supersede it.",
        "sources": [
          {
            "label": "MIT Admissions — Tests & scores",
            "url": "https://mitadmissions.org/apply/firstyear/tests-scores/"
          },
          {
            "label": "MIT Office of Graduate Education — IELTS",
            "url": "https://oge.mit.edu/graduate-admissions/applications/standardized-tests/ielts/"
          }
        ]
      },
      {
        "name": "Columbia University",
        "undergrad": "7.5 minimum",
        "postgrad": "7.5 (Graduate School of Arts and Sciences)",
        "notes": "The postgraduate figure is the GSAS minimum; Columbia's professional schools set their own requirements.",
        "sources": [
          {
            "label": "Columbia Undergraduate Admissions — English Proficiency Requirements",
            "url": "https://undergrad.admissions.columbia.edu/apply/international/english-proficiency"
          },
          {
            "label": "Columbia GSAS — Information for International Applicants",
            "url": "https://gsas.columbia.edu/degree-programs/admissions/information-international-applicants"
          }
        ]
      },
      {
        "name": "Purdue University",
        "undergrad": "6.5 or higher with a minimum of 6.0 in each section",
        "postgrad": "6.5 overall, with reading 6.5, listening 6.0, speaking 6.0 and writing 5.5",
        "notes": "Purdue notes some graduate programs require higher minimum scores than the Graduate School floor.",
        "sources": [
          {
            "label": "Purdue University — English Proficiency Requirements (undergraduate)",
            "url": "https://admissions.purdue.edu/become-student/english-proficiency/"
          },
          {
            "label": "Purdue Graduate School — English Proficiency Requirements",
            "url": "https://www.purdue.edu/gradschool/admissions/how-to-apply/apply-toefl.html"
          }
        ]
      },
      {
        "name": "Boston University",
        "undergrad": "7 or higher overall",
        "postgrad": "Not published as a single institution-wide figure",
        "notes": "BU states a total/overall score of 7 or higher satisfies its English language proficiency requirement for all programs; the page read covers undergraduate international applicants.",
        "sources": [
          {
            "label": "Boston University — International Applicants",
            "url": "https://www.bu.edu/admissions/apply/international/"
          }
        ]
      }
    ],
    "faq": [
      {
        "q": "Do I need IELTS for an F-1 student visa?",
        "a": "No IELTS band is set federally. DHS’s Study in the States states that the Student and Exchange Visitor Program does not regulate how well an international student must speak the language, and a Form I-20 is issued once the SEVP-certified school’s own English standard is met. The score you need is your university’s, not the visa’s."
      },
      {
        "q": "What IELTS score do US universities require?",
        "a": "The spread is wider than in most countries because every institution sets its own. When we checked, Purdue asked 6.5 with 6.0 in each section, Boston University 7.0 overall, MIT a minimum of 7 with 7.5 recommended, and Columbia 7.5. Graduate requirements are usually set by the department rather than the university, so check your programme page."
      },
      {
        "q": "Do I need IELTS for an H-1B work visa?",
        "a": "USCIS’s H-1B specialty occupation criteria turn on degrees, licensure and experience and include no English language test. The exception is foreign health care workers, who must pass an approved English test to obtain a VisaScreen certificate before the visa is issued."
      },
      {
        "q": "What IELTS score do nurses need for the US?",
        "a": "For VisaScreen, HRSA sets 6.5 overall with at least 7 in speaking for registered nurses and other health care workers qualified at bachelor’s level, and 6 overall with 7 in speaking below that level. Individual state boards of nursing may add their own requirements, so check both the federal standard and your state board."
      }
    ]
  },
  {
    "slug": "new-zealand",
    "name": "New Zealand",
    "shortName": "New Zealand",
    "verifiedOn": "2 September 2026",
    "answer": "Immigration New Zealand sets no IELTS band for a student visa — your education provider must be satisfied you can pass the course, and test results are not mandatory. For skilled residence the principal applicant needs 6.5 overall, while an Accredited Employer Work Visa at skill levels 3 to 5 needs only 4.0. Universities are unusually consistent at 6.0 overall with no band below 5.5 for bachelor’s degrees. Confirm current rules with INZ.",
    "purposes": [
      {
        "purpose": "Student visa",
        "band": "No IELTS score set by Immigration New Zealand — set by your education provider",
        "notes": "INZ requires your provider to declare it is satisfied you have the English language ability to pass the course, and states that English test results are not mandatory although they can support your genuine intention to study.",
        "sources": [
          {
            "label": "Immigration New Zealand — Fee Paying Student Visa",
            "url": "https://www.immigration.govt.nz/visas/fee-paying-student-visa/"
          }
        ]
      },
      {
        "purpose": "Skilled migration / work visa",
        "band": "Skilled residence: IELTS overall 6.5 or more (principal applicant). Accredited Employer Work Visa at ANZSCO/NOL skill level 3 to 5: IELTS overall 4 or more",
        "notes": "INZ accepts the General or Academic module; partners and dependent children of skilled residence applicants need overall 5 or more, and the test must be taken in person at a test centre within the previous 2 years.",
        "sources": [
          {
            "label": "Immigration New Zealand — English language requirements for skilled residence visas",
            "url": "https://www.immigration.govt.nz/process-to-apply/applying-for-a-visa/providing-evidence-and-documents-to-support-your-visa-application/english-language-requirements/english-language-requirements-for-skilled-residence-visas/"
          },
          {
            "label": "Immigration New Zealand — English language requirements for an Accredited Employer Work Visa",
            "url": "https://www.immigration.govt.nz/process-to-apply/applying-for-a-visa/providing-evidence-and-documents-to-support-your-visa-application/english-language-requirements/english-language-requirements-for-an-accredited-employer-work-visa/"
          }
        ]
      },
      {
        "purpose": "Undergraduate study",
        "band": "Typically 6.0 overall with no band below 5.5",
        "notes": "Set by each university, and unusually consistent — Auckland, Otago, Canterbury and Victoria University of Wellington all publish exactly 6.0 overall with no band below 5.5 for bachelor's degrees.",
        "sources": [
          {
            "label": "University of Auckland — Undergraduate English language requirements",
            "url": "https://www.auckland.ac.nz/en/study/applications-and-admissions/entry-requirements/undergraduate-entry-requirements/undergraduate-english-language-requirements.html"
          },
          {
            "label": "University of Otago — Language Requirements",
            "url": "https://www.otago.ac.nz/study/entry-requirements/language-requirements"
          },
          {
            "label": "University of Canterbury — English language requirements",
            "url": "https://www.canterbury.ac.nz/study/getting-started/admission-and-enrolment/enrolment-topics/english-language-proficiency/english-language-requirements"
          }
        ]
      },
      {
        "purpose": "Postgraduate study",
        "band": "Typically 6.5 overall with no band below 6.0",
        "notes": "Programme-specific above that floor — Otago's Law postgraduate programmes require 7.5 overall with 7 in each band, and teaching qualifications at Canterbury require 7.0 across the board.",
        "sources": [
          {
            "label": "University of Auckland — Postgraduate English language requirements",
            "url": "https://www.auckland.ac.nz/en/study/applications-and-admissions/entry-requirements/postgraduate-entry-requirements/postgraduate-english-language-requirements.html"
          },
          {
            "label": "University of Otago — Language Requirements",
            "url": "https://www.otago.ac.nz/study/entry-requirements/language-requirements"
          },
          {
            "label": "University of Canterbury — English language requirements",
            "url": "https://www.canterbury.ac.nz/study/getting-started/admission-and-enrolment/enrolment-topics/english-language-proficiency/english-language-requirements"
          }
        ]
      },
      {
        "purpose": "Nursing / medical registration",
        "band": "IELTS Academic: at least 7 in reading, listening and speaking, and at least 6.5 in writing",
        "notes": "Nursing Council of New Zealand requirement; scores can be combined across sittings within 12 months, and the Council does not accept online tests or PTE.",
        "sources": [
          {
            "label": "Nursing Council of New Zealand — Nursing Council Requirements (internationally qualified nurses)",
            "url": "https://nursingcouncil.org.nz/IQN/IQN/H5.aspx"
          }
        ]
      }
    ],
    "universities": [
      {
        "name": "University of Auckland",
        "undergrad": "6.0 overall and no bands below 5.5",
        "postgrad": "6.5 overall and no bands below 6.0",
        "notes": "These are the university-wide minimums; individual programmes can require higher.",
        "sources": [
          {
            "label": "University of Auckland — Undergraduate English language requirements",
            "url": "https://www.auckland.ac.nz/en/study/applications-and-admissions/entry-requirements/undergraduate-entry-requirements/undergraduate-english-language-requirements.html"
          },
          {
            "label": "University of Auckland — Postgraduate English language requirements",
            "url": "https://www.auckland.ac.nz/en/study/applications-and-admissions/entry-requirements/postgraduate-entry-requirements/postgraduate-english-language-requirements.html"
          }
        ]
      },
      {
        "name": "University of Otago",
        "undergrad": "6.0 overall, no individual band below 5.5",
        "postgrad": "6.5 overall, no individual band below 6.0",
        "notes": "Several programmes are set higher on the same page — Social Work requires 7.0 with no band below 7.0 and postgraduate Law requires 7.5 overall with a minimum of 7 in each band.",
        "sources": [
          {
            "label": "University of Otago — Language Requirements",
            "url": "https://www.otago.ac.nz/study/entry-requirements/language-requirements"
          }
        ]
      },
      {
        "name": "Te Herenga Waka — Victoria University of Wellington",
        "undergrad": "6.0 overall with no band lower than 5.5",
        "postgrad": "6.5 overall with no band lower than 6.0",
        "notes": "Standard requirements; the university lists separate pages for programmes with higher or externally set English requirements.",
        "sources": [
          {
            "label": "Victoria University of Wellington — Standard undergraduate English requirements",
            "url": "https://www.wgtn.ac.nz/international/applying/entry-requirements/english-language/standard-undergraduate"
          },
          {
            "label": "Victoria University of Wellington — Standard postgraduate English requirements",
            "url": "https://www.wgtn.ac.nz/international/applying/entry-requirements/english-language/standard-postgraduate"
          }
        ]
      },
      {
        "name": "University of Canterbury",
        "undergrad": "Average score of 6.0, with a minimum of 5.5 in reading, writing, listening and speaking",
        "postgrad": "Average score of 6.5, with a minimum of 6.0 in reading, writing, listening and speaking",
        "notes": "Teaching qualifications are a separate, higher tier on the same page — 7.0 overall with 7.0 in reading, writing and speaking.",
        "sources": [
          {
            "label": "University of Canterbury — English language requirements",
            "url": "https://www.canterbury.ac.nz/study/getting-started/admission-and-enrolment/enrolment-topics/english-language-proficiency/english-language-requirements"
          }
        ]
      }
    ],
    "faq": [
      {
        "q": "What IELTS score do I need for a New Zealand student visa?",
        "a": "Immigration New Zealand does not set one. It requires your education provider to declare it is satisfied you have the English language ability to pass the course, and states that English test results are not mandatory, although they can support your genuine intention to study. Your provider’s own entry requirement is the number to plan around."
      },
      {
        "q": "What IELTS score do I need for New Zealand residence?",
        "a": "For skilled residence visas the principal applicant needs an IELTS overall band of 6.5 or more, and partners and dependent children need 5.0 or more. Either the Academic or the General module is accepted, and the test must have been taken in person at a test centre within the previous two years."
      },
      {
        "q": "What IELTS score do New Zealand universities ask for?",
        "a": "Typically 6.0 overall with no band below 5.5 for bachelor’s degrees — Auckland, Otago, Canterbury and Victoria University of Wellington all published exactly that when we checked. Postgraduate study is typically 6.5 with no band below 6.0, and professional programmes such as Otago’s Law and Social Work degrees go to 7.0 or 7.5."
      },
      {
        "q": "What IELTS score do nurses need in New Zealand?",
        "a": "The Nursing Council of New Zealand requires IELTS Academic with at least 7 in reading, listening and speaking and at least 6.5 in writing. Scores can be combined across sittings within 12 months, but the Council does not accept online tests. Check the Council’s current requirements before you sit."
      }
    ]
  },
  {
    "slug": "ireland",
    "name": "Ireland",
    "shortName": "Ireland",
    "verifiedOn": "2 September 2026",
    "answer": "Ireland is unusual in setting a national student-visa band: Immigration Service Delivery requires IELTS Academic 5.0 overall for degree-level courses and 4.0 for second-level, foundation or preparatory English courses, and says plainly that the college’s own requirement may be higher. Universities typically ask 6.5 overall with 6.0 in each band. No English test is named for the Critical Skills Employment Permit, but nurses registering with NMBI need 7.0 overall.",
    "purposes": [
      {
        "purpose": "Student visa",
        "band": "IELTS Academic 5.0 overall (4.0 for second-level, foundation/NFQ Level 5 or preparatory English courses)",
        "notes": "Immigration Service Delivery sets this minimum for visa purposes only and states the college's own requirement may be higher.",
        "sources": [
          {
            "label": "Immigration Service Delivery - English language requirements for study visas",
            "url": "https://www.irishimmigration.ie/coming-to-study-in-ireland/english-language-requirements-for-study-visas/"
          }
        ]
      },
      {
        "purpose": "Skilled migration / work visa",
        "band": "No English test required",
        "notes": "The Critical Skills Employment Permit criteria list salary, qualification/experience and a two-year job offer, with no English language test named.",
        "sources": [
          {
            "label": "Dept. of Enterprise, Tourism and Employment - Critical Skills Employment Permit",
            "url": "https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/permit-types/critical-skills-employment-permit/"
          }
        ]
      },
      {
        "purpose": "Undergraduate study",
        "band": "Typically 6.5 overall with 6.0 in each band",
        "notes": "UCD's university-wide minimum and UCC's standard undergraduate minimum are both 6.5 with 6.0 per band; health-science courses sit higher.",
        "sources": [
          {
            "label": "UCD Registry - Minimum English Language Requirements",
            "url": "https://www.ucd.ie/registry/prospectivestudents/admissions/policiesandgeneralregulations/generalrequirements/minimumenglishlanguagerequirements/"
          },
          {
            "label": "UCC - Undergraduate English Language Entry Requirements",
            "url": "https://www.ucc.ie/en/study/comparison/english/undergraduate/"
          }
        ]
      },
      {
        "purpose": "Postgraduate study",
        "band": "Typically 6.5 overall with 6.0 in each band",
        "notes": "UCD applies the same minimum to graduate taught and research degrees; UCC's general postgraduate minimum matches, with 7.0 for many health programmes.",
        "sources": [
          {
            "label": "UCD Registry - Minimum English Language Requirements",
            "url": "https://www.ucd.ie/registry/prospectivestudents/admissions/policiesandgeneralregulations/generalrequirements/minimumenglishlanguagerequirements/"
          },
          {
            "label": "UCC - Postgraduate English Language Entry Requirements",
            "url": "https://www.ucc.ie/en/study/comparison/english/postgraduate/"
          }
        ]
      },
      {
        "purpose": "Nursing / medical registration",
        "band": "Nurses and midwives (NMBI): 7.0 overall, with 7.0 in three components and 6.5 in one. Doctors (Medical Council): 7.0 overall with 6.5 in each module.",
        "notes": "Both regulators require Academic IELTS taken within the last two years and neither accepts combined sittings.",
        "sources": [
          {
            "label": "NMBI - English language requirements for overseas trained nurses/midwives",
            "url": "https://www.nmbi.ie/Registration/Qualified-outside-the-EU/Application-Process/English-Language-Requirements"
          },
          {
            "label": "Irish Medical Council - English Language",
            "url": "https://medicalcouncil.ie/registration-applications/first-time-applicants/english-language.html"
          }
        ]
      }
    ],
    "universities": [
      {
        "name": "Trinity College Dublin",
        "undergrad": "6.5 overall, 6.0 in each band (Band B)",
        "postgrad": "6.5 overall, 6.0 in each band (Band B)",
        "notes": "Trinity bands its courses: Band B (6.5/6.0) covers the majority of undergraduate and postgraduate courses, while Band C courses require 7.0 overall with 6.5 in each band.",
        "sources": [
          {
            "label": "Trinity College Dublin - English Language Requirements",
            "url": "https://www.tcd.ie/study/english-language-requirements/"
          }
        ]
      },
      {
        "name": "University College Dublin",
        "undergrad": "6.5 overall, 6.0 in each band",
        "postgrad": "6.5 overall, 6.0 in each band",
        "notes": "One university-wide minimum applies to all levels of study; UCD assesses a single sitting only and does not accept One Skill Retake scores.",
        "sources": [
          {
            "label": "UCD Registry - Minimum English Language Requirements",
            "url": "https://www.ucd.ie/registry/prospectivestudents/admissions/policiesandgeneralregulations/generalrequirements/minimumenglishlanguagerequirements/"
          }
        ]
      },
      {
        "name": "University College Cork",
        "undergrad": "6.5 overall, 6.0 in each band",
        "postgrad": "6.5 overall, 6.0 in each band",
        "notes": "Programme-specific: College of Medicine and Health undergraduate entry needs 6.5 in every band, Speech & Language Therapy 7.0 overall with 6.5 per band, and several postgraduate health programmes 7.0 overall with 6.5 per skill.",
        "sources": [
          {
            "label": "UCC - Undergraduate English Language Entry Requirements",
            "url": "https://www.ucc.ie/en/study/comparison/english/undergraduate/"
          },
          {
            "label": "UCC - Postgraduate English Language Entry Requirements",
            "url": "https://www.ucc.ie/en/study/comparison/english/postgraduate/"
          }
        ]
      },
      {
        "name": "University of Galway",
        "undergrad": "6.5 overall, no section below 6.0",
        "postgrad": "6.5 overall, no section below 6.0",
        "notes": "Programme-specific: BSc Nursing Science and BSc Midwifery require 7.0 overall with no component below 6.5, as do English, Journalism and Film Studies programmes.",
        "sources": [
          {
            "label": "University of Galway - Entry Requirements",
            "url": "https://www.universityofgalway.ie/global-galway/studyinireland/entryrequirements/"
          }
        ]
      }
    ],
    "faq": [
      {
        "q": "What IELTS score do I need for an Irish student visa?",
        "a": "Immigration Service Delivery sets IELTS Academic 5.0 overall for degree-level study and 4.0 for second-level, foundation, NFQ Level 5 or preparatory English courses. That is a visa minimum only — ISD states that the college’s own requirement may be higher, and Irish universities typically ask for 6.5 overall with 6.0 in each band."
      },
      {
        "q": "What IELTS score do Irish universities require?",
        "a": "Typically 6.5 overall with 6.0 in each band. That was the university-wide minimum at UCD and the standard requirement at UCC, Trinity (Band B) and the University of Galway when we checked. Health-science and communications courses sit higher, commonly 7.0 overall with 6.5 per band."
      },
      {
        "q": "Do I need IELTS for a Critical Skills Employment Permit?",
        "a": "The Department of Enterprise, Tourism and Employment’s criteria for the Critical Skills Employment Permit list salary, qualification or experience, and a job offer of at least two years — no English language test is named. Requirements can change, so confirm on enterprise.gov.ie before applying."
      },
      {
        "q": "What IELTS score do nurses and doctors need in Ireland?",
        "a": "NMBI requires 7.0 overall for nurses and midwives, with 7.0 in three components and 6.5 in one. The Irish Medical Council requires 7.0 overall with 6.5 in each module for doctors. Both require Academic IELTS taken within the last two years, and neither accepts scores combined across sittings."
      }
    ]
  },
  {
    "slug": "germany",
    "name": "Germany",
    "shortName": "Germany",
    "verifiedOn": "2 September 2026",
    "answer": "Germany sets no national IELTS score. The student visa checklist asks only for proof of language skills in the programme’s language of instruction, and most bachelor’s degrees are taught in German, requiring DSH-2 or TestDaF 4 rather than IELTS. English-taught master’s programmes typically ask 6.0 to 6.5, with TUM setting a university-wide 6.5. The EU Blue Card requires no English test, and nursing registration needs German at B2 plus a specialist language examination.",
    "purposes": [
      {
        "purpose": "Student visa",
        "band": "No IELTS score set - the university's language of instruction requirement applies (as a rule at least B2)",
        "notes": "The German missions' student visa checklist asks only for proof of language skills in the language of instruction, naming no test or band.",
        "sources": [
          {
            "label": "German Missions / Federal Foreign Office - National Visa for Students (Section 16b Residence Act), January 2025",
            "url": "https://www.germany.info/resource/blob/2435500/d4beca8da37c3570d38b2bf5e9bdd64c/study-data.pdf"
          }
        ]
      },
      {
        "purpose": "Skilled migration / work visa",
        "band": "No English test required",
        "notes": "BAMF lists a degree or qualifying professional experience and a job offer of at least six months for the EU Blue Card; German is mentioned only for later settlement, not for the card itself.",
        "sources": [
          {
            "label": "BAMF - The EU Blue Card",
            "url": "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Migrathek/BlaueKarteEU/blauekarteeu.html"
          }
        ]
      },
      {
        "purpose": "Undergraduate study",
        "band": "Usually no IELTS - German proficiency (DSH-2 or TestDaF 4 in all sections) instead",
        "notes": "Heidelberg states all undergraduate programmes are taught in German, and RWTH's own language table lists German for almost every Bachelor's course.",
        "sources": [
          {
            "label": "Heidelberg University - Language requirements for international students",
            "url": "https://www.uni-heidelberg.de/en/study/advisory-services/learning-languages/language-requirements-for-international-students"
          },
          {
            "label": "RWTH Aachen - Language requirements (PDF)",
            "url": "https://www.rwth-aachen.de/global/show_document.asp?id=aaaaaaaaabpixuo&download=1"
          }
        ]
      },
      {
        "purpose": "Postgraduate study",
        "band": "Typically 6.0-6.5 overall for English-taught master's programmes",
        "notes": "TUM sets a university-wide minimum of 6.5; RWTH's standard English clause accepts 6.0, rising to 7.0 for a small number of programmes.",
        "sources": [
          {
            "label": "TUM - Language Certificates",
            "url": "https://www.tum.de/en/studies/application/application-info-portal/admission-requirements/language-certificates"
          },
          {
            "label": "RWTH Aachen - Language requirements (PDF)",
            "url": "https://www.rwth-aachen.de/global/show_document.asp?id=aaaaaaaaabpixuo&download=1"
          }
        ]
      },
      {
        "purpose": "Nursing / medical registration",
        "band": "No English test - German at CEFR B2 plus a subject-specific language examination",
        "notes": "The federal recognition portal lists knowledge of German at B2 and a specialist language examination among the requirements for authorisation to use the nursing title.",
        "sources": [
          {
            "label": "Recognition in Germany (federal portal) - recognition procedure as General nurse (Pflegefachperson)",
            "url": "https://www.anerkennung-in-deutschland.de/en/interest/finder/result?arrangement=Ja&location=47949&nationality=Drittstaat&profession=1695&qualification=Drittstaaten&whereabouts=Ausland&zipSearch=0&pdf=1"
          },
          {
            "label": "Recognition in Germany - German language skills and courses",
            "url": "https://www.anerkennung-in-deutschland.de/html/en/pro/german-language-skills.php"
          }
        ]
      }
    ],
    "universities": [
      {
        "name": "Technical University of Munich (TUM)",
        "undergrad": "6.5 overall where the programme is taught in English",
        "postgrad": "6.5 overall",
        "notes": "A single university-wide minimum band score of 6.5 applies to every degree programme taught in English; German-taught programmes require German instead.",
        "sources": [
          {
            "label": "TUM - Language Certificates",
            "url": "https://www.tum.de/en/studies/application/application-info-portal/admission-requirements/language-certificates"
          }
        ]
      },
      {
        "name": "RWTH Aachen University",
        "undergrad": "Mostly not applicable - almost all Bachelor's courses are German-taught",
        "postgrad": "6.0 overall (standard English clause); 7.0 for a small set of programmes",
        "notes": "Programme-specific: RWTH's language table assigns each course a statutory clause - the common English clause accepts IELTS 6.0, and the higher clause used by e.g. Biomedical Engineering M.Sc. and Materials Engineering (International profile) M.Sc. requires 7.0.",
        "sources": [
          {
            "label": "RWTH Aachen - Language requirements (PDF)",
            "url": "https://www.rwth-aachen.de/global/show_document.asp?id=aaaaaaaaabpixuo&download=1"
          },
          {
            "label": "RWTH Aachen - Language Requirements",
            "url": "https://www.rwth-aachen.de/cms/root/studium/vor-dem-studium/zugangsvoraussetzungen/~zwyn/sprachkenntnisse/?lidx=1"
          }
        ]
      },
      {
        "name": "Freie Universität Berlin",
        "undergrad": "Not applicable - Bachelor's programmes are German-taught",
        "postgrad": "5.5-6.5 overall where B2 English is required; 7.0 where C1 is required",
        "notes": "Programme-specific: FU publishes an IELTS-to-CEFR mapping and each master's programme states whether it wants B2 or C1.",
        "sources": [
          {
            "label": "Freie Universität Berlin - Foreign language admission requirements for a master's degree program",
            "url": "https://www.fu-berlin.de/en/studium/bewerbung/master/konsekutive-masterstudiengaenge/sprachliche-zugangsvoraussetzungen/index.html"
          }
        ]
      },
      {
        "name": "Heidelberg University",
        "undergrad": "No IELTS - DSH-2 level German required",
        "postgrad": "7.0 overall for the MA Transcultural Studies",
        "notes": "Programme-specific: Heidelberg publishes no university-wide IELTS minimum; the 7.0 figure is the MA Transcultural Studies C1 requirement, and German-taught master's programmes require DSH-2 instead.",
        "sources": [
          {
            "label": "Heidelberg University - Language requirements for international students",
            "url": "https://www.uni-heidelberg.de/en/study/advisory-services/learning-languages/language-requirements-for-international-students"
          },
          {
            "label": "Heidelberg Centre for Transcultural Studies - MATS application",
            "url": "https://www.hcts.uni-heidelberg.de/en/studies/masters-program-mats/application"
          }
        ]
      }
    ],
    "faq": [
      {
        "q": "Do I need IELTS for a German student visa?",
        "a": "The German missions’ student visa checklist asks for proof of language skills in the language of instruction and names no test or band. If your programme is taught in German you will need German — as a rule at least B2, and often DSH-2 or TestDaF 4. If it is taught in English, the university’s own IELTS requirement applies instead."
      },
      {
        "q": "What IELTS score do German universities require?",
        "a": "Only for English-taught programmes, and it is set per university. TUM publishes a single university-wide minimum of 6.5 for every English-taught degree; RWTH Aachen’s standard English clause accepts 6.0, rising to 7.0 for a small set of master’s programmes. Heidelberg publishes no university-wide figure at all."
      },
      {
        "q": "Can I study a bachelor’s degree in Germany with IELTS?",
        "a": "Usually not on its own. Heidelberg states that all its undergraduate programmes are taught in German, and RWTH’s language table lists German for almost every bachelor’s course. Undergraduate study in Germany generally means German proficiency at DSH-2 or TestDaF 4, with English-taught options concentrated at master’s level."
      },
      {
        "q": "Do I need English for a German work visa?",
        "a": "The EU Blue Card requirements listed by BAMF are a degree or qualifying professional experience plus a job offer of at least six months; no English test appears. German is mentioned in connection with later settlement rather than the card itself. Confirm current conditions on the BAMF site."
      }
    ]
  },
  {
    "slug": "netherlands",
    "name": "the Netherlands",
    "shortName": "the Netherlands",
    "verifiedOn": "2 September 2026",
    "answer": "The IND sets no IELTS band for a student residence permit — the institution decides — and the highly skilled migrant route requires no English test either. Dutch universities typically ask 6.0 to 6.5 overall with 6.0 per section for bachelor’s study and 6.5 for master’s, with TU Delft requiring 7.0 overall with 6.5 per section for every MSc. Healthcare registration is primarily about Dutch rather than English, plus a separate English reading requirement.",
    "purposes": [
      {
        "purpose": "Student visa",
        "band": "No IELTS score set - the educational institution decides",
        "notes": "The IND's conditions cover accreditation, sponsorship, income and study progress; the page names no language test and says the institution may require one for admission.",
        "sources": [
          {
            "label": "IND - Student residence permit for university or higher professional education",
            "url": "https://ind.nl/en/residence-permits/study/student-residence-permit-for-university-or-higher-professional-education"
          }
        ]
      },
      {
        "purpose": "Skilled migration / work visa",
        "band": "No English test required",
        "notes": "The highly skilled migrant conditions are an employment contract with an IND-recognised sponsor, a salary meeting the income requirement and market rate, and BIG registration for healthcare roles - no language test appears.",
        "sources": [
          {
            "label": "IND - Highly skilled migrant",
            "url": "https://ind.nl/en/residence-permits/work/highly-skilled-migrant"
          }
        ]
      },
      {
        "purpose": "Undergraduate study",
        "band": "Typically 6.0-6.5 overall with 6.0 in each section",
        "notes": "TU/e applies 6.5 overall with 6.0 per section university-wide; Groningen's faculty table ranges from 6.0 to 7.0 depending on faculty.",
        "sources": [
          {
            "label": "TU Eindhoven - Language proficiency requirements",
            "url": "https://www.tue.nl/en/education/become-a-tue-student/admission-and-enrollment/language-proficiency-requirements"
          },
          {
            "label": "University of Groningen - Bachelor's language requirements and exemptions",
            "url": "https://www.rug.nl/education/application-enrolment-tuition-fees/admission/procedures/application-informatie/with-non-dutch-diploma/bachelor/bachelor-entry-requirements/language-requirements-and-exemptions?lang=en"
          }
        ]
      },
      {
        "purpose": "Postgraduate study",
        "band": "Typically 6.5 overall with 6.0 in each section; selective programmes ask 7.0 with 6.5",
        "notes": "Groningen's standard master's entry is 6.5 with 6.0 per category, while TU Delft requires 7.0 overall with 6.5 per section for every MSc.",
        "sources": [
          {
            "label": "University of Groningen - Master's language requirements",
            "url": "https://www.rug.nl/education/application-enrolment-tuition-fees/admission/procedures/application-informatie/with-non-dutch-diploma/master/master-language-requirements?lang=en"
          },
          {
            "label": "TU Delft - MSc admission requirements (international diploma)",
            "url": "https://www.tudelft.nl/en/education/admission-and-application/msc-international-diploma/admission-requirements"
          }
        ]
      },
      {
        "purpose": "Nursing / medical registration",
        "band": "Dutch, not English, is the main requirement: B1 for nurses (MBO), B2 for HBO professions, B2+ for doctors, dentists and pharmacists. English reading only: IELTS 5.5-6.0 (university level) or 4.0-5.0 (HBO level).",
        "notes": "The BIG-register asks for a Dutch certificate at the level matching the professional group, plus proof of English reading skills, which does not apply to VIG nursing assistants.",
        "sources": [
          {
            "label": "BIG-register - Dutch language skills and English reading skills",
            "url": "https://english.bigregister.nl/foreign-diploma/procedures/certificate-of-competence/dutch-language-proficiency"
          },
          {
            "label": "BIG-register - English reading skills",
            "url": "https://english.bigregister.nl/foreign-diploma/procedures/certificate-of-competence/dutch-language-proficiency/english-reading-skills"
          }
        ]
      }
    ],
    "universities": [
      {
        "name": "University of Amsterdam",
        "undergrad": "Not verified on a UvA-wide page",
        "postgrad": "7.0 overall, minimum 6.5 in each sub-score (Graduate School of Humanities)",
        "notes": "Programme-specific: UvA sets English requirements per graduate school rather than university-wide; IELTS Indicator, One Skill Retake and IELTS Online are not accepted.",
        "sources": [
          {
            "label": "UvA Graduate School of Humanities - English language requirements",
            "url": "https://gsh.uva.nl/application-and-admission/english-language-requirements/english-language-requirements.html"
          }
        ]
      },
      {
        "name": "Delft University of Technology (TU Delft)",
        "undergrad": "6.5 overall for English-taught BSc programmes (5.5 for Dutch-taught)",
        "postgrad": "7.0 overall with a minimum of 6.5 in each section",
        "notes": "The BSc figure is an overall band score with no section minimums published; the MSc requirement applies across all master's programmes.",
        "sources": [
          {
            "label": "TU Delft - BSc international diploma admission requirements",
            "url": "https://www.tudelft.nl/en/education/admission-and-application/bsc-international-diploma/1-admission-requirements/"
          },
          {
            "label": "TU Delft - MSc admission requirements (international diploma)",
            "url": "https://www.tudelft.nl/en/education/admission-and-application/msc-international-diploma/admission-requirements"
          }
        ]
      },
      {
        "name": "Utrecht University",
        "undergrad": "6.0 overall (Listening 6.0, Reading 6.0, Speaking 5.5, Writing 5.5) at the EMI-ready level",
        "postgrad": "6.0 overall at EMI-ready; higher for programmes set at EMI-experienced or EMI-advanced",
        "notes": "Programme-specific: Utrecht grades programmes into three EMI levels and each programme chooses its own; only the EMI-ready thresholds were read.",
        "sources": [
          {
            "label": "Utrecht University - EMI-ready",
            "url": "https://www.uu.nl/en/masters/general-information/application-and-admission/english-language-requirements/emi-ready"
          },
          {
            "label": "Utrecht University - English language requirements (Masters)",
            "url": "https://www.uu.nl/en/masters/general-information/application-and-admission/english-language-requirements"
          }
        ]
      },
      {
        "name": "University of Groningen",
        "undergrad": "6.5 overall with 6.0 in every category at most faculties",
        "postgrad": "6.5 overall with 6.0 in all categories; some programmes 7.0 with 6.5",
        "notes": "Programme-specific: Groningen publishes a per-faculty table - Economics and Business asks 6.0 overall, Law 7.0 overall, Science and Engineering 6.5 with 6.5 in every category, and a few master's programmes go to 8.0.",
        "sources": [
          {
            "label": "University of Groningen - Bachelor's language requirements and exemptions",
            "url": "https://www.rug.nl/education/application-enrolment-tuition-fees/admission/procedures/application-informatie/with-non-dutch-diploma/bachelor/bachelor-entry-requirements/language-requirements-and-exemptions?lang=en"
          },
          {
            "label": "University of Groningen - Master's language requirements",
            "url": "https://www.rug.nl/education/application-enrolment-tuition-fees/admission/procedures/application-informatie/with-non-dutch-diploma/master/master-language-requirements?lang=en"
          }
        ]
      },
      {
        "name": "Eindhoven University of Technology (TU/e)",
        "undergrad": "6.5 overall with 6.0 per section",
        "postgrad": "6.5 overall with 6.0 per section",
        "notes": "TU/e publishes one language table that does not differentiate bachelor's from master's entry.",
        "sources": [
          {
            "label": "TU Eindhoven - Language proficiency requirements",
            "url": "https://www.tue.nl/en/education/become-a-tue-student/admission-and-enrollment/language-proficiency-requirements"
          }
        ]
      }
    ],
    "faq": [
      {
        "q": "What IELTS score do I need for a Dutch student visa?",
        "a": "The IND does not set one. Its conditions for a student residence permit cover accreditation, sponsorship, income and study progress, and the page says the institution may require a language test for admission. The number you need is your university’s, not the IND’s."
      },
      {
        "q": "What IELTS score do Dutch universities require?",
        "a": "Typically 6.0 to 6.5 overall with 6.0 in each section for bachelor’s study and 6.5 for master’s. TU Delft is the notable outlier, requiring 7.0 overall with a minimum of 6.5 in each section for every MSc programme. Groningen sets requirements per faculty, from 6.0 in Economics and Business to 7.0 in Law."
      },
      {
        "q": "Do I need an English test for the Dutch highly skilled migrant permit?",
        "a": "No language test appears in the IND’s conditions, which are an employment contract with an IND-recognised sponsor, a salary meeting the income and market-rate requirements, and BIG registration for healthcare roles. Check ind.nl for the current conditions before relying on this."
      },
      {
        "q": "What language do I need to work as a nurse in the Netherlands?",
        "a": "Dutch, primarily. The BIG-register asks for a Dutch certificate at the level matching your professional group — B1 for MBO-level nurses, B2 for HBO professions and B2+ for doctors, dentists and pharmacists — plus proof of English reading skills, for which it accepts IELTS 5.5 to 6.0 at university level."
      }
    ]
  },
  {
    "slug": "united-arab-emirates",
    "name": "the United Arab Emirates",
    "shortName": "the UAE",
    "verifiedOn": "2 September 2026",
    "answer": "The UAE sets no national IELTS score for a student or work visa — the university decides for study, and the government’s work visa page names no language test. Universities typically ask 5.5 to 6.5 overall, with the American University of Sharjah and Khalifa University both requiring 6.5. Healthcare professionals licensing under the unified requirements need 5.0 overall in Academic IELTS where they did not study in English. Verify with the institution or health authority.",
    "purposes": [
      {
        "purpose": "Student visa",
        "band": "No IELTS score set - the university or college decides",
        "notes": "The UAE government portal asks only for a certificate from the university or institute stating the duration of study, plus the general residence provisions.",
        "sources": [
          {
            "label": "The Official Portal of the UAE Government - Residence visa for studying in the UAE",
            "url": "https://u.ae/en/information-and-services/visa-and-emirates-id/residence-visas/residence-visa-for-studying-in-the-uae"
          }
        ]
      },
      {
        "purpose": "Skilled migration / work visa",
        "band": "No English test required",
        "notes": "The government portal's work visa page describes a two-year renewable employment visa and names no language test; healthcare roles meet their English requirement through the professional licensing route instead.",
        "sources": [
          {
            "label": "The Official Portal of the UAE Government - Work visa",
            "url": "https://u.ae/en/information-and-services/visa-and-emirates-id/residence-visas/residence-visa-for-working-in-the-uae"
          }
        ]
      },
      {
        "purpose": "Undergraduate study",
        "band": "Typically 5.5-6.5 overall",
        "notes": "American University of Sharjah asks 6.5 and Khalifa University 6.5, while the University of Sharjah treats 5.5 as the point at which remedial English is waived.",
        "sources": [
          {
            "label": "American University of Sharjah - Bachelor's application requirements",
            "url": "https://www.aus.edu/admissions/bachelors-degrees/application-requirements"
          },
          {
            "label": "Khalifa University - Minimum English language requirements FAQ",
            "url": "https://www.ku.ac.ae/faqs/what-are-the-minimum-english-language-requirements-e-g-toefl-ielts-test-scoresi"
          },
          {
            "label": "University of Sharjah - Undergraduate admissions",
            "url": "https://www.sharjah.ac.ae/en/Admissions/Undergraduate"
          }
        ]
      },
      {
        "purpose": "Postgraduate study",
        "band": "Typically 6.0-6.5 overall",
        "notes": "Khalifa and AUS both require 6.5 for master's entry; Zayed University accepts 6.0 (5.5 conditional) for English-taught graduate programmes.",
        "sources": [
          {
            "label": "Khalifa University - Graduate admissions requirements",
            "url": "https://www.ku.ac.ae/admissions/graduate-admissions/graduate-admissions-requirements"
          },
          {
            "label": "American University of Sharjah - Master's application requirements",
            "url": "https://www.aus.edu/admissions/masters-degrees/application-requirements"
          },
          {
            "label": "Zayed University - Graduate admission requirements",
            "url": "https://www.zu.ac.ae/main/en/gsd/_admissions/admission-requirements"
          }
        ]
      },
      {
        "purpose": "Nursing / medical registration",
        "band": "5.0 overall (Academic IELTS), or TOEFL 500, OET grade C, Cambridge 169",
        "notes": "The UAE's Unified Professional Qualification Requirements ask for this evidence when the applicant did not study in English or is licensed in a non-English-speaking country; all licensure examinations are conducted in English.",
        "sources": [
          {
            "label": "DHA Sheryan - Unified Healthcare Professional Qualification Requirements (PQR), April 2025",
            "url": "https://services.dha.gov.ae/sheryan/wps/contenthandler/war/SheryanHomeThemeStatic/themes/Portal8.5/docs/PQR_April_2025.pdf"
          },
          {
            "label": "DHA - Manual for Licensing Healthcare Professionals v1.1 (2024)",
            "url": "https://www.dha.gov.ae/uploads/122024/Manual%20for%20Licensing%20Healthcare%20professionals-202420241212775.pdf"
          }
        ]
      }
    ],
    "universities": [
      {
        "name": "American University of Sharjah",
        "undergrad": "6.5 overall (Academic)",
        "postgrad": "6.5 overall (Academic)",
        "notes": "Bachelor's applicants scoring between 4.5 and 6.0 may instead enter the Bridge Program; AUS bachelor's graduates are exempt at master's level.",
        "sources": [
          {
            "label": "AUS - Bachelor's application requirements",
            "url": "https://www.aus.edu/admissions/bachelors-degrees/application-requirements"
          },
          {
            "label": "AUS - Master's application requirements",
            "url": "https://www.aus.edu/admissions/masters-degrees/application-requirements"
          }
        ]
      },
      {
        "name": "Khalifa University",
        "undergrad": "6.5 overall (Academic)",
        "postgrad": "6.5 overall (Academic)",
        "notes": "Khalifa publishes one figure for all applicants and does not differentiate by level; scores must be under two years old and only Academic IELTS is accepted.",
        "sources": [
          {
            "label": "Khalifa University - Minimum English language requirements FAQ",
            "url": "https://www.ku.ac.ae/faqs/what-are-the-minimum-english-language-requirements-e-g-toefl-ielts-test-scoresi"
          },
          {
            "label": "Khalifa University - Graduate admissions requirements",
            "url": "https://www.ku.ac.ae/admissions/graduate-admissions/graduate-admissions-requirements"
          }
        ]
      },
      {
        "name": "Zayed University",
        "undergrad": "No IELTS figure published - 80% in Grade 12 English or TOEFL iBT 72",
        "postgrad": "6.0 overall for English-taught programmes (5.5 conditional); 4.0 for Arabic-taught programmes",
        "notes": "The undergraduate admissions page lists only school English grades and TOEFL iBT, and the Intelligence Systems Engineering degree sets a higher bar (85% or TOEFL iBT 79).",
        "sources": [
          {
            "label": "Zayed University - Graduate admission requirements",
            "url": "https://www.zu.ac.ae/main/en/gsd/_admissions/admission-requirements"
          },
          {
            "label": "Zayed University - Undergraduate admissions criteria",
            "url": "https://www.zu.ac.ae/main/en/undergraduate-programs/admission-criteria"
          }
        ]
      }
    ],
    "faq": [
      {
        "q": "What IELTS score do I need to study in the UAE?",
        "a": "There is no national visa band. The UAE government portal’s student residence visa page asks only for a certificate from the university stating the duration of study. The institution sets the English requirement: the American University of Sharjah and Khalifa University both publish 6.5 for Academic IELTS, while the University of Sharjah treats 5.5 as the point at which remedial English is waived."
      },
      {
        "q": "Do I need IELTS for a UAE work visa?",
        "a": "The government portal’s work visa page describes a two-year renewable employment visa and names no language test. Healthcare roles are the exception: they meet their English requirement through the professional licensing route rather than through the visa itself."
      },
      {
        "q": "What IELTS score do nurses and doctors need in the UAE?",
        "a": "The UAE’s Unified Professional Qualification Requirements ask for 5.0 overall in Academic IELTS — or TOEFL 500, OET grade C or Cambridge 169 — when the applicant did not study in English or is licensed in a non-English-speaking country. All licensure examinations are conducted in English. Confirm with the relevant health authority."
      },
      {
        "q": "What IELTS score do UAE universities need for a master’s?",
        "a": "Typically 6.0 to 6.5. Khalifa University and the American University of Sharjah both require 6.5 for master’s entry, while Zayed University accepts 6.0 for English-taught graduate programmes, with 5.5 accepted conditionally. Check the programme page for the exact figure."
      }
    ]
  },
  {
    "slug": "singapore",
    "name": "Singapore",
    "shortName": "Singapore",
    "verifiedOn": "2 September 2026",
    "answer": "Singapore sets no national IELTS requirement. The ICA’s Student’s Pass checklist names no language test, Employment Pass eligibility turns on salary and COMPASS points rather than English, and the Ministry of Health says foreign nurses meet the English standard through interviews and the licensure examination rather than a test score. Universities typically ask 6.0 to 6.5 — NUS 6.5 in overall, reading and writing, and NTU 6.0 overall. Confirm with the institution.",
    "purposes": [
      {
        "purpose": "Student visa",
        "band": "No IELTS score set - the institution decides",
        "notes": "ICA's Student's Pass checklist covers the school's Registration Acknowledgement Letter, travel and family documents and a photograph, and names no language test.",
        "sources": [
          {
            "label": "ICA - Student's Pass: Institutes of Higher Learning",
            "url": "https://www.ica.gov.sg/reside/STP/apply/ihl"
          }
        ]
      },
      {
        "purpose": "Skilled migration / work visa",
        "band": "No English test required",
        "notes": "Employment Pass eligibility is a two-stage test of the qualifying salary and at least 40 COMPASS points; no language test appears in the criteria.",
        "sources": [
          {
            "label": "Ministry of Manpower - Employment Pass eligibility",
            "url": "https://www.mom.gov.sg/passes-and-permits/employment-pass/eligibility"
          }
        ]
      },
      {
        "purpose": "Undergraduate study",
        "band": "Typically 6.0-6.5 overall",
        "notes": "NUS asks 6.5 in Overall, Reading and Writing and SIT 6.5, while NTU accepts 6.0 overall with 6 in Writing and Speaking.",
        "sources": [
          {
            "label": "NUS Office of Admissions - English Language Test Scores (updated August 2026)",
            "url": "https://www.nus.edu.sg/oam/docs/default-source/default-document-library/english-test-scores.pdf"
          },
          {
            "label": "NTU - Other International Qualifications",
            "url": "https://www.ntu.edu.sg/admissions/undergraduate/admission-guide/international-qualifications/other-international-qualifications"
          }
        ]
      },
      {
        "purpose": "Postgraduate study",
        "band": "Typically 6.0-6.5 overall, rising to 7.0 at some schools",
        "notes": "NTU's coursework guide sets 6.0 or 6.5 for most schools and 7.0 for a few, such as the S. Rajaratnam School of International Studies.",
        "sources": [
          {
            "label": "NTU - Coursework Programmes Admission Guide",
            "url": "https://www.ntu.edu.sg/admissions/graduate/cwadmissionguide"
          }
        ]
      },
      {
        "purpose": "Nursing / medical registration",
        "band": "No IELTS or OET score set",
        "notes": "MOH says foreign nurses meet the English standard through recruitment interviews and the Singapore Nursing Board's licensure examination, which is conducted in English.",
        "sources": [
          {
            "label": "Ministry of Health - Verification of foreign nurses' qualifications",
            "url": "https://www.moh.gov.sg/newsroom/verification-of-foreign-nurses'-qualifications/"
          },
          {
            "label": "Singapore Nursing Board - Foreign Trained Nurses / Midwives",
            "url": "https://www.snb.gov.sg/for-professionals/becoming-a-nurse-or-midwife/apply-for-registration-enrolment/foreign-trained-nurses-midwives/"
          }
        ]
      }
    ],
    "universities": [
      {
        "name": "National University of Singapore (NUS)",
        "undergrad": "6.5 in Overall, Reading and Writing (Academic)",
        "postgrad": "Set per programme, not university-wide",
        "notes": "The undergraduate figure comes from the Office of Admissions table dated August 2026; IELTS Indicator and One Skill Retake are not accepted, and scores are valid two years.",
        "sources": [
          {
            "label": "NUS Office of Admissions - English Language Test Scores",
            "url": "https://www.nus.edu.sg/oam/docs/default-source/default-document-library/english-test-scores.pdf"
          }
        ]
      },
      {
        "name": "Nanyang Technological University (NTU)",
        "undergrad": "6.0 overall with 6 in Writing and 6 in Speaking",
        "postgrad": "6.0-6.5 overall depending on school; 7.0 at a few",
        "notes": "Programme-specific: Nanyang Business School asks 6.5 and Materials Science & Engineering 6.0; tests must be within two years of the application.",
        "sources": [
          {
            "label": "NTU - Other International Qualifications",
            "url": "https://www.ntu.edu.sg/admissions/undergraduate/admission-guide/international-qualifications/other-international-qualifications"
          },
          {
            "label": "NTU - Coursework Programmes Admission Guide",
            "url": "https://www.ntu.edu.sg/admissions/graduate/cwadmissionguide"
          }
        ]
      },
      {
        "name": "Singapore University of Technology and Design (SUTD)",
        "undergrad": "No prescribed minimum score",
        "postgrad": "Not verified",
        "notes": "SUTD states applications are reviewed comprehensively on academic and non-academic achievement; a test score is compulsory only where English was not the medium of instruction.",
        "sources": [
          {
            "label": "SUTD - Criteria for admission (other international qualifications)",
            "url": "https://www.sutd.edu.sg/admissions/undergraduate/other-international-qualifications/criteria-for-admission/"
          }
        ]
      },
      {
        "name": "Singapore Institute of Technology (SIT)",
        "undergrad": "6.5 (Academic)",
        "postgrad": "Not verified",
        "notes": "Applicants who fall short may be invited to sit an English test run by SIT; some programmes set a higher requirement and the higher of the two applies.",
        "sources": [
          {
            "label": "SIT - Application guide for international qualifications (April 2026)",
            "url": "https://www.singaporetech.edu.sg/sites/default/files/2026-04/Application%20International%20Guide_06042026.pdf"
          }
        ]
      }
    ],
    "faq": [
      {
        "q": "What IELTS score do I need for a Singapore Student’s Pass?",
        "a": "The ICA does not set one. Its Student’s Pass checklist for institutes of higher learning covers the school’s Registration Acknowledgement Letter, travel and family documents and a photograph, with no language test named. The institution that admits you sets the English requirement."
      },
      {
        "q": "What IELTS score do Singapore universities require?",
        "a": "Typically 6.0 to 6.5 overall for undergraduate entry. NUS asks 6.5 in overall, reading and writing; NTU accepts 6.0 overall with 6 in writing and speaking; SIT asks 6.5. SUTD publishes no prescribed minimum and reviews applications comprehensively. Postgraduate requirements at NTU range from 6.0 to 7.0 depending on the school."
      },
      {
        "q": "Do I need IELTS for a Singapore Employment Pass?",
        "a": "No English test appears in the Ministry of Manpower’s Employment Pass eligibility criteria, which are a two-stage test of the qualifying salary and at least 40 COMPASS points. Check mom.gov.sg, as the criteria are revised periodically."
      },
      {
        "q": "What English do nurses need in Singapore?",
        "a": "The Ministry of Health states that foreign nurses meet the English standard through recruitment interviews and the Singapore Nursing Board’s licensure examination, which is conducted in English, rather than through a required IELTS or OET score. Check the Singapore Nursing Board for current registration requirements."
      }
    ]
  }
];

export const SCORE_REQUIREMENT_COUNTRY_SLUGS = SCORE_REQUIREMENT_COUNTRIES.map(
  (country) => country.slug
);

export function getScoreRequirementCountry(slug) {
  return SCORE_REQUIREMENT_COUNTRIES.find((country) => country.slug === slug) || null;
}
