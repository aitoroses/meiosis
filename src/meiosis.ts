export interface Mapper<A, B> {
  (value: A): B;
}

export interface Stream<T> {
  /**
   * Gets the current value of the stream.
   */
  (): T;

  /**
   * Sets a new value on the stream.
   */
  (value: T): Stream<T>;

  /**
   * Maps over a stream.
   */
  map<T, R>(mapper: Mapper<T, R>): Stream<R>;
}

export interface Scanner<A, B> {
  (acc: A, next: B): A;
}

export interface TraceParameters<M> {
  modelChanges: Stream<any>;
  streams: Array<Stream<any>>;
  copy?: Function;
}

export interface EventType {
  type: string;
  data: any;
}

export function applyModelChange<M>(model: M, modelChange: Function) {
  return modelChange(model);
}

const createEventFor = (eventStream: Stream<EventType>, section: any, created: any, prefix: string) => {
  Object.keys(section).forEach(key => {
    created[key] = {};

    if (section[key].length) {
      section[key].forEach((sectionKey: string) => {
        const type = prefix + key + "." + sectionKey;

        const fn: any = (data: any) => eventStream({ type, data });

        fn.map = (callback: Function) => eventStream.map((event: EventType) => {
          if (event.type === type) {
            callback(event.data);
          }
        });

        created[key][sectionKey] = fn;
        created[type] = fn;
      });
    }
    else {
      createEventFor(eventStream, section[key], created[key], prefix + key + ".");
    }
  });

  return created;
};

export const createEvents = (eventStream: Stream<EventType>, events: any, connections: any) => {
  const createdEvents = createEventFor(eventStream, events, {}, "");

  if (connections) {
    Object.keys(connections).forEach(type =>
      connections[type].forEach((listener: string) =>
        createdEvents[type].map((data: any) => createdEvents[listener](data))
      )
    );
  }

  return createdEvents;
};

export function isMeiosisTracerOn(): boolean {
  return window && window["__MEIOSIS_TRACER_GLOBAL_HOOK__"];
}

export function trace<M>(params: TraceParameters<M>): void {
  if (!params.modelChanges || !params.streams) {
    throw new Error("Please specify streamLibrary, modelChanges, and streams.");
  }

  if (isMeiosisTracerOn()) {
    const copy: any = params.copy || ((model: M) => JSON.parse(JSON.stringify(model)));
    const bufferedValues: Array<any> = [];
    let devtoolInitialized: boolean = false;
    let sendValues: boolean = true;

    let changes: Date = new Date();
    let lastChange: Date = changes;
    params.modelChanges.map(() => changes = new Date());

    const firstStream = params.streams[0];
    const lastStream = params.streams[params.streams.length - 1];

    window.addEventListener("message", evt => {
      if (evt.data.type === "MEIOSIS_RENDER_MODEL") {
        sendValues = evt.data.sendValuesBack;
        params.streams[0](evt.data.model);
      }
      else if (evt.data.type === "MEIOSIS_TRACER_INIT") {
        devtoolInitialized = true;
        bufferedValues.forEach(values => window.postMessage({ type: "MEIOSIS_VALUES", values, update: true }, "*"));
      }
    });

    lastStream.map(() => {
      const change: Date = changes;
      const update: boolean = change !== lastChange;
      lastChange = change;

      const values: Array<any> = params.streams.map((stream: Stream<any>) =>
        ({ value: copy(stream()) }));

      if (sendValues || update) {
        if (devtoolInitialized) {
          window.postMessage({ type: "MEIOSIS_VALUES", values, update }, "*");
        }
        else {
          bufferedValues.push(values);
        }
      }
    });
  }
};
