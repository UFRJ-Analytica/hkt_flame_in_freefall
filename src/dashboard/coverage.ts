// The ten resources listed in the challenge brief and how each one is used here. Counts for
// ingested documents come from the live corpus (research-corpus.json), never from this file.

export type CoverageStatus = "data" | "indexed" | "metadata-only";

export interface ChallengeResource {
  id: string;
  label: string;
  url: string;
  corpusIds: string[];
  status: CoverageStatus;
  use: string;
}

export const CHALLENGE_RESOURCES: ChallengeResource[] = [
  { id: "psi", label: "PSI Data Repository: Combustion Science", url: "https://psi.nasa.gov/", corpusIds: [], status: "data",
    use: "All 24 PSI Combustion Science investigations: metadata, 2,001 tabulated records (20 with public tables; 4 have no public CSV in PSI) and linked raw videos." },
  { id: "combustion", label: "NASA Combustion Science (Glenn)", url: "https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/", corpusIds: ["nasa-combustion-science", "nasa-sofie", "nasa-flare", "nasa-fm2"], status: "indexed",
    use: "Program overview plus the SoFIE, FLARE and FM² investigation pages, indexed for semantic search." },
  { id: "sciencecasts", label: "NASA ScienceCasts: The Power of Studying Combustion on the ISS (2018 video)", url: "https://www.issnationallab.org/blog/nasa-sciencecasts-the-power-of-studying-combustion-on-the-iss/", corpusIds: [], status: "metadata-only",
    use: "Listed, not indexed: no NASA-hosted transcript could be retrieved, and SI does not quote what it cannot read." },
  { id: "guide", label: "A Researcher's Guide to ISS Combustion Science (2015)", url: "https://www.nasa.gov/wp-content/uploads/2016/05/np-2015-10-034-jsc_combustion_in_reduced_gravity-iss-mini-book-011116-508.pdf", corpusIds: ["nasa-guide-2015"], status: "indexed",
    use: "Full PDF indexed page by page; the largest document source for SI answers." },
  { id: "apollo1", label: "Apollo 1", url: "https://www.nasa.gov/mission/apollo-1/", corpusIds: ["nasa-apollo-1"], status: "indexed", use: "Historical mishap; indexed as context, not as a requirement." },
  { id: "apollo13", label: "Apollo 13", url: "https://www.nasa.gov/mission/apollo-13/", corpusIds: ["nasa-apollo-13"], status: "indexed", use: "Historical mishap; indexed as context, not as a requirement." },
  { id: "mir", label: "25 Years Ago: Fire Aboard Space Station Mir", url: "https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/", corpusIds: ["nasa-mir-fire"], status: "indexed", use: "Historical mishap with cause, response and ISS design changes." },
  { id: "air-tanks", label: "Spinoff: Fireman's Air Tanks", url: "https://spinoff.nasa.gov/node/9582", corpusIds: ["nasa-spinoff-air-tanks"], status: "indexed", use: "Terrestrial spinoff (breathing equipment)." },
  { id: "detector", label: "Spinoff: Fire Detector", url: "https://spinoff.nasa.gov/node/9407", corpusIds: ["nasa-spinoff-detector"], status: "indexed", use: "Terrestrial spinoff (Shuttle smoke detector)." },
  { id: "attire", label: "Spinoff: New Technology for the Fire Attire", url: "https://spinoff.nasa.gov/node/9918", corpusIds: ["nasa-spinoff-fire-attire"], status: "indexed", use: "Terrestrial spinoff (protective clothing)." },
];

export const EXTRA_SOURCES = "Also indexed: NASA fact sheets for BASS, SAFFIRE and SAME; published SAFFIRE IV–VI and SoFIE-GEL papers feed the modeling table.";
