import { useEffect, useState } from "react";
import { ArrowUpRight, Download, Film, Play } from "lucide-react";

type MediaIndex = {
  investigations: Record<string, { videoCount: number; portalUrl: string; files: Record<string, number> }>;
  records: Record<string, { investigationId: string; precision: "test" | "day"; videos: string[]; count: number }>;
};

let cache: Promise<MediaIndex | null> | null = null;
function loadMedia() {
  cache ??= fetch(`${import.meta.env.BASE_URL}data/nasa-media.json`)
    .then((response) => (response.ok ? (response.json() as Promise<MediaIndex>) : null))
    .catch(() => null);
  return cache;
}

export function useMediaIndex() {
  const [media, setMedia] = useState<MediaIndex | null>(null);
  useEffect(() => {
    let alive = true;
    void loadMedia().then((value) => alive && setMedia(value));
    return () => {
      alive = false;
    };
  }, []);
  return media;
}

const mediaUrl = (investigationId: string, file: string) =>
  `/api/media?${new URLSearchParams({ investigation: investigationId, file })}`;
const playable = (file: string) => /\.(mp4|mov)$/i.test(file);
const megabytes = (bytes?: number) => (bytes ? `${Math.max(1, Math.round(bytes / 1e6))} MB` : "tamanho desconhecido");
const shortName = (file: string, investigationId: string) => file.replace(`${investigationId}_Raw Data_`, "").replace(/^.*_Raw Data_/, "");

/** Raw NASA PSI video(s) for one tabular record, linked only by explicit filename rules. */
export function RecordVideos({ recordId, investigationId }: { recordId: string; investigationId: string }) {
  const media = useMediaIndex();
  const [playing, setPlaying] = useState<string | null>(null);
  if (!media) return null;
  const investigation = media.investigations[investigationId];
  const link = media.records[recordId];
  if (!investigation) return null;

  if (!link) {
    return (
      <div className="record-videos muted">
        <Film size={13} aria-hidden="true" />
        <span>
          {investigation.videoCount} vídeos brutos desta investigação no PSI, sem ligação segura a este registro.{" "}
          <a href={investigation.portalUrl} target="_blank" rel="noreferrer">
            Ver no PSI <ArrowUpRight size={11} />
          </a>
        </span>
      </div>
    );
  }

  const heading =
    link.precision === "test"
      ? link.count > 1 ? `${link.count} vídeos deste ensaio` : "Vídeo deste ensaio"
      : `${link.count} vídeos gravados no mesmo dia de teste (não necessariamente desta linha)`;
  return (
    <div className="record-videos">
      <p className="record-videos-heading">
        <Film size={13} aria-hidden="true" /> {heading} · NASA PSI
      </p>
      <ul>
        {link.videos.map((file) => (
          <li key={file}>
            <span title={file}>{shortName(file, investigationId)}</span>
            <small>{megabytes(investigation.files[file])}</small>
            {playable(file) && (
              <button className="button secondary small" onClick={() => setPlaying(playing === file ? null : file)} aria-pressed={playing === file}>
                <Play size={11} /> {playing === file ? "Fechar" : "Assistir"}
              </button>
            )}
            <a className="button secondary small" href={mediaUrl(investigationId, file)} target="_blank" rel="noreferrer">
              <Download size={11} /> Baixar
            </a>
          </li>
        ))}
      </ul>
      {link.count > link.videos.length && <small>+{link.count - link.videos.length} no PSI.</small>}
      {playing && (
        <video className="record-video-player" controls autoPlay preload="metadata" src={mediaUrl(investigationId, playing)}>
          Seu navegador não reproduz este vídeo; use “Baixar”.
        </video>
      )}
      <small className="muted">Vídeo bruto da NASA, transmitido diretamente do PSI. Arquivos .ts exigem download (ex.: VLC).</small>
    </div>
  );
}
