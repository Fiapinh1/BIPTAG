interface NDEFRecord {
  recordType: string;
  mediaType?: string;
  id?: string;
  encoding?: string;
  lang?: string;
  data: DataView;
}

interface NDEFMessage {
  records: NDEFRecord[];
}

interface NDEFReadingEvent extends Event {
  serialNumber: string;
  message: NDEFMessage;
}

interface NDEFReader extends EventTarget {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  addEventListener(
    type: 'reading',
    listener: (event: NDEFReadingEvent) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  addEventListener(
    type: 'readingerror',
    listener: (event: Event) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
}

declare var NDEFReader: {
  prototype: NDEFReader;
  new (): NDEFReader;
};
