import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Section {
  id: string;
  number: string;
  title: string;
  content: string | React.ReactNode;
}

interface Chapter {
  number: string;
  title: string;
  sections: Section[];
}

const CHAPTERS: Chapter[] = [
  {
    number: "I",
    title: "Preliminary",
    sections: [
      {
        id: "s1",
        number: "1",
        title: "Short Title, Extent and Commencement",
        content:
          "This Act may be called the Digital Personal Data Protection Act, 2023. It extends to the whole of India. It also applies to processing of digital personal data outside the territory of India, if such processing is in connection with any activity related to offering of goods or services to Data Principals within the territory of India.",
      },
      {
        id: "s2",
        number: "2",
        title: "Key Definitions",
        content: (
          <div className="space-y-2">
            {[
              {
                term: "Personal Data",
                def: "Any data about an individual who is identifiable by or in relation to such data.",
              },
              {
                term: "Data Principal",
                def: "The individual to whom the personal data relates. In the case of a child (under 18), includes the parents or lawful guardian.",
              },
              {
                term: "Data Fiduciary",
                def: "Any person who alone or in conjunction with other persons determines the purpose and means of processing of personal data.",
              },
              {
                term: "Data Processor",
                def: "Any person who processes personal data on behalf of a Data Fiduciary.",
              },
              {
                term: "Processing",
                def: "A wholly or partly automated operation or set of operations performed on digital personal data, including collection, recording, organisation, structuring, storage, adaptation, retrieval, use, alignment, combination, indexing, sharing, disclosure, restriction, erasure or destruction.",
              },
              {
                term: "Consent Manager",
                def: "A person registered with the Board who acts as a single point of contact to enable a Data Principal to give, manage, review and withdraw her consent.",
              },
              {
                term: "Significant Data Fiduciary",
                def: "A Data Fiduciary or class of Data Fiduciaries as may be notified by the Central Government on the basis of volume of personal data processed, sensitivity of data, risk to rights of Data Principal, national security, and other relevant factors.",
              },
            ].map(({ term, def }) => (
              <div key={term} className="pl-3 border-l-2 border-primary/30">
                <span className="font-semibold text-foreground">{term}: </span>
                <span className="text-muted-foreground">{def}</span>
              </div>
            ))}
          </div>
        ),
      },
    ],
  },
  {
    number: "II",
    title: "Obligations of Data Fiduciary",
    sections: [
      {
        id: "s4",
        number: "4",
        title: "Grounds for Processing Personal Data",
        content:
          "A Data Fiduciary may process the personal data of a Data Principal only in accordance with the provisions of this Act and for a lawful purpose — (a) for which the Data Principal has given her consent; or (b) for certain legitimate uses as specified in Section 7. The purpose of processing must be reasonable, having regard to the context in which data is collected, and the Data Principal's reasonable expectations.",
      },
      {
        id: "s5",
        number: "5",
        title: "Notice",
        content:
          "At the time of seeking consent from a Data Principal, the Data Fiduciary shall give a notice that contains: (a) the personal data and the purpose for which it is proposed to be processed; (b) the manner in which the Data Principal may exercise her rights; and (c) the manner in which she may make a complaint to the Board. The notice shall be clear, plain and made available in English or any language listed in the Eighth Schedule of the Constitution.",
      },
      {
        id: "s6",
        number: "6",
        title: "Consent",
        content:
          "Consent given by the Data Principal shall be free, specific, informed, unconditional and unambiguous with a clear affirmative action, and shall signify an agreement to the processing of her personal data for the specified purpose, and be limited to such personal data as is necessary for such purpose. The Data Principal has the right to withdraw her consent at any time. The Data Fiduciary must cease processing within a reasonable time after such withdrawal, and must provide a platform for withdrawal that is as easy as the platform for giving consent.",
      },
      {
        id: "s7",
        number: "7",
        title: "Certain Legitimate Uses",
        content:
          "A Data Fiduciary may process personal data of a Data Principal for a legitimate use, including: (a) if the Data Principal has voluntarily provided her personal data and has not indicated that she does not consent to the use of her personal data; (b) for the purposes of employment, including prevention of corporate espionage, maintenance of confidentiality, processing on the basis of employment contract, or termination of employment; (c) for providing medical treatment or health services during any disaster or breakdown of public order; (d) for purposes related to the safety or security of persons; (e) for preventing and detecting fraud; (f) for debt-recovery related purposes.",
      },
      {
        id: "s8",
        number: "8",
        title: "General Obligations of Data Fiduciary",
        content:
          "Every Data Fiduciary shall: (a) make reasonable efforts to ensure the accuracy and completeness of the data; (b) build reasonable security safeguards to prevent personal data breach; (c) intimate the Board and each affected Data Principal in the event of a personal data breach in such manner and within such time as may be prescribed; and (d) erase the personal data upon withdrawal of consent or when the purpose has been served, unless retention is required under law. The Data Fiduciary shall not retain personal data beyond the period necessary for the stated purpose.",
      },
      {
        id: "s9",
        number: "9",
        title: "Processing of Personal Data of Children",
        content:
          "A Data Fiduciary shall, before processing any personal data of a child (a person below the age of eighteen years), obtain verifiable consent of the parent or the lawful guardian of such child. A Data Fiduciary shall not undertake any processing of personal data that is likely to cause detrimental effect on the well-being of the child. A Data Fiduciary shall not track or behaviourally monitor children or target them with advertising.",
      },
      {
        id: "s10",
        number: "10",
        title: "Additional Obligations of Significant Data Fiduciary",
        content:
          "A Significant Data Fiduciary shall additionally: (a) appoint a Data Protection Officer based in India; (b) appoint an independent data auditor to conduct data audit; (c) undertake periodic Data Protection Impact Assessment; (d) undertake periodic audits; and (e) such other measures as may be prescribed. A Significant Data Fiduciary shall not transfer certain categories of sensitive personal data outside India unless authorised by the Central Government.",
      },
    ],
  },
  {
    number: "III",
    title: "Rights and Duties of Data Principal",
    sections: [
      {
        id: "s11",
        number: "11",
        title: "Right to Access Information About Personal Data",
        content:
          "A Data Principal shall have the right to obtain from the Data Fiduciary: (a) a summary of personal data being processed and the processing activities undertaken by such Data Fiduciary; (b) the identities of all other Data Fiduciaries and Data Processors with whom the personal data has been shared, along with a description of the personal data so shared; and (c) any other information related to her personal data and its processing. The Data Fiduciary shall respond in such manner and within such period as may be prescribed.",
      },
      {
        id: "s12",
        number: "12",
        title: "Right to Correction and Erasure of Personal Data",
        content:
          "A Data Principal shall have the right to: (a) correction of inaccurate or misleading personal data; (b) completion of incomplete personal data; (c) updating of personal data; and (d) erasure of personal data that is no longer necessary for the purpose for which it was collected, or where consent has been withdrawn. Upon receiving such a request, the Data Fiduciary shall, as the case may be, correct, complete, update or erase the personal data in such manner and within such period as may be prescribed.",
      },
      {
        id: "s13",
        number: "13",
        title: "Right of Grievance Redressal",
        content:
          "A Data Principal shall have the right to readily available means of grievance redressal provided by the Data Fiduciary or Consent Manager. The Data Fiduciary shall respond to grievances in such manner and within such period as may be prescribed. If the Data Principal is not satisfied with the response or does not receive a response, she may file a complaint with the Data Protection Board of India.",
      },
      {
        id: "s14",
        number: "14",
        title: "Right to Nominate",
        content:
          "A Data Principal shall have the right to nominate any other individual, who shall in the event of the death or incapacity of the Data Principal, exercise the rights of the Data Principal in accordance with the prescribed procedure.",
      },
      {
        id: "s15",
        number: "15",
        title: "Duties of Data Principal",
        content:
          "A Data Principal shall: (a) not impersonate another person while providing personal data; (b) not suppress any material information while providing personal data for any document, unique identifier, proof of identity or proof of address; (c) not register a false or frivolous grievance or complaint with a Data Fiduciary or the Board; and (d) furnish only such information as is verifiably authentic while exercising the right of correction or erasure. A Data Principal shall be liable for consequences of providing false information.",
      },
    ],
  },
  {
    number: "IV",
    title: "Special Provisions",
    sections: [
      {
        id: "s16",
        number: "16",
        title: "Application to Processing Outside India",
        content:
          "This Act applies to the processing of digital personal data outside the territory of India if such processing is in connection with any activity related to offering of goods or services to Data Principals within the territory of India. The Central Government may, by notification, restrict the transfer of personal data by a Data Fiduciary for processing to such countries and territories outside India as may be so notified.",
      },
      {
        id: "s17",
        number: "17",
        title: "Exemptions",
        content:
          "The Central Government may, in the interest of sovereignty and integrity of India, security of the State, friendly relations with foreign States, maintenance of public order or preventing incitement to cognisable offences, exempt any instrumentality of the State from all or any provisions of this Act. Research, archiving and statistical purposes are also exempt under prescribed conditions. Start-ups may be exempt from certain provisions as notified.",
      },
    ],
  },
  {
    number: "V",
    title: "Data Protection Board of India",
    sections: [
      {
        id: "s18",
        number: "18–27",
        title: "Establishment and Composition of the Board",
        content:
          "The Central Government shall establish a body known as the Data Protection Board of India. The Board shall be a digital-first body capable of performing its functions in an online, digital manner. The Board shall consist of a Chairperson and such number of other Members as may be prescribed. The Chairperson and Members shall be appointed by the Central Government. The Board shall have the power to adjudicate complaints, impose penalties, and issue directions to Data Fiduciaries.",
      },
    ],
  },
  {
    number: "VI",
    title: "Penalties",
    sections: [
      {
        id: "s33",
        number: "33–35",
        title: "Penalties for Breach",
        content: (
          <div className="space-y-3">
            <p className="text-muted-foreground">
              The Board may impose financial penalties on Data Fiduciaries for contraventions of the
              Act. Key penalties include:
            </p>
            {[
              {
                offence: "Breach of obligation to implement security safeguards",
                penalty: "Up to ₹250 crore",
              },
              {
                offence: "Breach of obligation to notify Data Principal or Board of data breach",
                penalty: "Up to ₹200 crore",
              },
              {
                offence: "Breach of obligation related to children",
                penalty: "Up to ₹200 crore",
              },
              {
                offence: "Breach of additional obligations of Significant Data Fiduciary",
                penalty: "Up to ₹150 crore",
              },
              {
                offence: "Breach of duties by Data Principal",
                penalty: "Up to ₹10,000",
              },
              {
                offence: "Other contraventions",
                penalty: "Up to ₹50 crore",
              },
            ].map(({ offence, penalty }) => (
              <div
                key={offence}
                className="flex justify-between items-start gap-4 p-2 rounded bg-muted/40"
              >
                <span className="text-sm text-muted-foreground flex-1">{offence}</span>
                <span className="text-sm font-semibold text-destructive shrink-0">{penalty}</span>
              </div>
            ))}
          </div>
        ),
      },
    ],
  },
  {
    number: "VII",
    title: "Miscellaneous",
    sections: [
      {
        id: "s36",
        number: "36–44",
        title: "Miscellaneous Provisions",
        content:
          "The Central Government may issue directions to any Data Fiduciary or class of Data Fiduciaries for taking measures to ensure compliance. No civil court shall have jurisdiction to entertain any suit or proceeding in respect of any matter which the Board is empowered to determine. An appeal against any order of the Board shall lie to the Appellate Tribunal constituted under the Information Technology Act, 2000. The Act overrides inconsistent provisions in other laws to the extent of inconsistency.",
      },
    ],
  },
];

export function DpdpaActContent() {
  const [activeChapter, setActiveChapter] = useState<string | null>(null);

  return (
    <div className="flex gap-6">
      {/* Table of Contents */}
      <aside className="hidden lg:block w-56 shrink-0">
        <div className="sticky top-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Chapters
          </p>
          <nav className="space-y-1">
            {CHAPTERS.map((ch) => (
              <button
                key={ch.number}
                onClick={() => {
                  setActiveChapter(ch.number);
                  document.getElementById(`chapter-${ch.number}`)?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }}
                className={`w-full text-left text-xs px-2 py-1.5 rounded transition-colors ${
                  activeChapter === ch.number
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <span className="font-semibold">Ch. {ch.number}</span> — {ch.title}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* Act Content */}
      <div className="flex-1 min-w-0 space-y-8">
        {/* Header */}
        <div className="rounded-xl bg-primary/5 border border-primary/20 p-5">
          <Badge variant="outline" className="mb-2 text-xs border-primary/30 text-primary">
            Act No. 22 of 2023
          </Badge>
          <h1 className="text-xl font-bold text-foreground">
            Digital Personal Data Protection Act, 2023
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            An Act to provide for the processing of digital personal data in a manner that
            recognises both the right of individuals to protect their personal data and the need to
            process such personal data for lawful purposes.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Ministry of Electronics and Information Technology · Received Presidential Assent on 11
            August 2023
          </p>
        </div>

        {CHAPTERS.map((chapter) => (
          <div key={chapter.number} id={`chapter-${chapter.number}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
                {chapter.number}
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Chapter</p>
                <h2 className="text-base font-bold text-foreground">{chapter.title}</h2>
              </div>
            </div>

            <div className="space-y-3 pl-11">
              {chapter.sections.map((section) => (
                <Card key={section.id} className="border border-border shadow-sm">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      <Badge variant="secondary" className="text-xs shrink-0 mt-0.5 font-semibold">
                        §{section.number}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-foreground mb-2">
                          {section.title}
                        </h3>
                        <div className="text-sm text-muted-foreground leading-relaxed">
                          {typeof section.content === "string" ? (
                            <p>{section.content}</p>
                          ) : (
                            section.content
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}

        <p className="text-xs text-muted-foreground text-center pb-4">
          This is a simplified summary for informational purposes. For the full official text, refer
          to the Gazette of India Extraordinary, Part II, Section 1, dated 11-08-2023.
        </p>
      </div>
    </div>
  );
}
