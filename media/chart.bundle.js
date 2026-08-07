"use strict";
(() => {
  // node_modules/.pnpm/solid-js@1.9.14/node_modules/solid-js/dist/solid.js
  var sharedConfig = {
    context: void 0,
    registry: void 0,
    effects: void 0,
    done: false,
    getContextId() {
      return getContextId(this.context.count);
    },
    getNextContextId() {
      return getContextId(this.context.count++);
    }
  };
  function getContextId(count) {
    const num = String(count), len = num.length - 1;
    return sharedConfig.context.id + (len ? String.fromCharCode(96 + len) : "") + num;
  }
  function setHydrateContext(context) {
    sharedConfig.context = context;
  }
  function nextHydrateContext() {
    return {
      ...sharedConfig.context,
      id: sharedConfig.getNextContextId(),
      count: 0
    };
  }
  var IS_DEV = false;
  var equalFn = (a, b) => a === b;
  var $PROXY = /* @__PURE__ */ Symbol("solid-proxy");
  var $TRACK = /* @__PURE__ */ Symbol("solid-track");
  var signalOptions = {
    equals: equalFn
  };
  var ERROR = null;
  var runEffects = runQueue;
  var STALE = 1;
  var PENDING = 2;
  var UNOWNED = {
    owned: null,
    cleanups: null,
    context: null,
    owner: null
  };
  var Owner = null;
  var Transition = null;
  var Scheduler = null;
  var ExternalSourceConfig = null;
  var Listener = null;
  var Updates = null;
  var Effects = null;
  var ExecCount = 0;
  function createRoot(fn, detachedOwner) {
    const listener = Listener, owner = Owner, unowned = fn.length === 0, current = detachedOwner === void 0 ? owner : detachedOwner, root = unowned ? UNOWNED : {
      owned: null,
      cleanups: null,
      context: current ? current.context : null,
      owner: current
    }, updateFn = unowned ? fn : () => fn(() => untrack(() => cleanNode(root)));
    Owner = root;
    Listener = null;
    try {
      return runUpdates(updateFn, true);
    } finally {
      Listener = listener;
      Owner = owner;
    }
  }
  function createSignal(value, options) {
    options = options ? Object.assign({}, signalOptions, options) : signalOptions;
    const s = {
      value,
      observers: null,
      observerSlots: null,
      comparator: options.equals || void 0
    };
    const setter = (value2) => {
      if (typeof value2 === "function") {
        if (Transition && Transition.running && Transition.sources.has(s)) value2 = value2(s.tValue);
        else value2 = value2(s.value);
      }
      return writeSignal(s, value2);
    };
    return [readSignal.bind(s), setter];
  }
  function createRenderEffect(fn, value, options) {
    const c = createComputation(fn, value, false, STALE);
    if (Scheduler && Transition && Transition.running) Updates.push(c);
    else updateComputation(c);
  }
  function createEffect(fn, value, options) {
    runEffects = runUserEffects;
    const c = createComputation(fn, value, false, STALE), s = SuspenseContext && useContext(SuspenseContext);
    if (s) c.suspense = s;
    if (!options || !options.render) c.user = true;
    Effects ? Effects.push(c) : updateComputation(c);
  }
  function createMemo(fn, value, options) {
    options = options ? Object.assign({}, signalOptions, options) : signalOptions;
    const c = createComputation(fn, value, true, 0);
    c.observers = null;
    c.observerSlots = null;
    c.comparator = options.equals || void 0;
    if (Scheduler && Transition && Transition.running) {
      c.tState = STALE;
      Updates.push(c);
    } else updateComputation(c);
    return readSignal.bind(c);
  }
  function batch(fn) {
    return runUpdates(fn, false);
  }
  function untrack(fn) {
    if (!ExternalSourceConfig && Listener === null) return fn();
    const listener = Listener;
    Listener = null;
    try {
      if (ExternalSourceConfig) return ExternalSourceConfig.untrack(fn);
      return fn();
    } finally {
      Listener = listener;
    }
  }
  function on(deps, fn, options) {
    const isArray = Array.isArray(deps);
    let prevInput;
    let defer = options && options.defer;
    return (prevValue) => {
      let input;
      if (isArray) {
        input = Array(deps.length);
        for (let i = 0; i < deps.length; i++) input[i] = deps[i]();
      } else input = deps();
      if (defer) {
        defer = false;
        return prevValue;
      }
      const result = untrack(() => fn(input, prevInput, prevValue));
      prevInput = input;
      return result;
    };
  }
  function onMount(fn) {
    createEffect(() => untrack(fn));
  }
  function onCleanup(fn) {
    if (Owner === null) ;
    else if (Owner.cleanups === null) Owner.cleanups = [fn];
    else Owner.cleanups.push(fn);
    return fn;
  }
  function getListener() {
    return Listener;
  }
  function startTransition(fn) {
    if (Transition && Transition.running) {
      fn();
      return Transition.done;
    }
    const l = Listener;
    const o = Owner;
    return Promise.resolve().then(() => {
      Listener = l;
      Owner = o;
      let t;
      if (Scheduler || SuspenseContext) {
        t = Transition || (Transition = {
          sources: /* @__PURE__ */ new Set(),
          effects: [],
          promises: /* @__PURE__ */ new Set(),
          disposed: /* @__PURE__ */ new Set(),
          queue: /* @__PURE__ */ new Set(),
          running: true
        });
        t.done || (t.done = new Promise((res) => t.resolve = res));
        t.running = true;
      }
      runUpdates(fn, false);
      Listener = Owner = null;
      return t ? t.done : void 0;
    });
  }
  var [transPending, setTransPending] = /* @__PURE__ */ createSignal(false);
  function useContext(context) {
    let value;
    return Owner && Owner.context && (value = Owner.context[context.id]) !== void 0 ? value : context.defaultValue;
  }
  var SuspenseContext;
  function readSignal() {
    const runningTransition = Transition && Transition.running;
    if (this.sources && (runningTransition ? this.tState : this.state)) {
      if ((runningTransition ? this.tState : this.state) === STALE) updateComputation(this);
      else {
        const updates = Updates;
        Updates = null;
        runUpdates(() => lookUpstream(this), false);
        Updates = updates;
      }
    }
    if (Listener) {
      const observers = this.observers;
      if (!observers || observers[observers.length - 1] !== Listener) {
        const sSlot = observers ? observers.length : 0;
        if (!Listener.sources) {
          Listener.sources = [this];
          Listener.sourceSlots = [sSlot];
        } else {
          Listener.sources.push(this);
          Listener.sourceSlots.push(sSlot);
        }
        if (!observers) {
          this.observers = [Listener];
          this.observerSlots = [Listener.sources.length - 1];
        } else {
          observers.push(Listener);
          this.observerSlots.push(Listener.sources.length - 1);
        }
      }
    }
    if (runningTransition && Transition.sources.has(this)) return this.tValue;
    return this.value;
  }
  function writeSignal(node, value, isComp) {
    let current = Transition && Transition.running && Transition.sources.has(node) ? node.tValue : node.value;
    if (!node.comparator || !node.comparator(current, value)) {
      if (Transition) {
        const TransitionRunning = Transition.running;
        if (TransitionRunning || !isComp && Transition.sources.has(node)) {
          Transition.sources.add(node);
          node.tValue = value;
        }
        if (!TransitionRunning) node.value = value;
      } else node.value = value;
      if (node.observers && node.observers.length) {
        runUpdates(() => {
          for (let i = 0; i < node.observers.length; i += 1) {
            const o = node.observers[i];
            const TransitionRunning = Transition && Transition.running;
            if (TransitionRunning && Transition.disposed.has(o)) continue;
            if (TransitionRunning ? !o.tState : !o.state) {
              if (o.pure) Updates.push(o);
              else Effects.push(o);
              if (o.observers) markDownstream(o);
            }
            if (!TransitionRunning) o.state = STALE;
            else o.tState = STALE;
          }
          if (Updates.length > 1e6) {
            Updates = [];
            if (IS_DEV) ;
            throw new Error();
          }
        }, false);
      }
    }
    return value;
  }
  function updateComputation(node) {
    if (!node.fn) return;
    cleanNode(node);
    const time = ExecCount;
    runComputation(node, Transition && Transition.running && Transition.sources.has(node) ? node.tValue : node.value, time);
    if (Transition && !Transition.running && Transition.sources.has(node)) {
      queueMicrotask(() => {
        runUpdates(() => {
          Transition && (Transition.running = true);
          Listener = Owner = node;
          runComputation(node, node.tValue, time);
          Listener = Owner = null;
        }, false);
      });
    }
  }
  function runComputation(node, value, time) {
    let nextValue;
    const owner = Owner, listener = Listener;
    Listener = Owner = node;
    try {
      nextValue = node.fn(value);
    } catch (err) {
      if (node.pure) {
        if (Transition && Transition.running) {
          node.tState = STALE;
          node.tOwned && node.tOwned.forEach(cleanNode);
          node.tOwned = void 0;
        } else {
          node.state = STALE;
          node.owned && node.owned.forEach(cleanNode);
          node.owned = null;
        }
      }
      node.updatedAt = time + 1;
      return handleError(err);
    } finally {
      Listener = listener;
      Owner = owner;
    }
    if (!node.updatedAt || node.updatedAt <= time) {
      if (node.updatedAt != null && "observers" in node) {
        writeSignal(node, nextValue, true);
      } else if (Transition && Transition.running && node.pure) {
        if (!Transition.sources.has(node)) node.value = nextValue;
        Transition.sources.add(node);
        node.tValue = nextValue;
      } else node.value = nextValue;
      node.updatedAt = time;
    }
  }
  function createComputation(fn, init2, pure, state = STALE, options) {
    const c = {
      fn,
      state,
      updatedAt: null,
      owned: null,
      sources: null,
      sourceSlots: null,
      cleanups: null,
      value: init2,
      owner: Owner,
      context: Owner ? Owner.context : null,
      pure
    };
    if (Transition && Transition.running) {
      c.state = 0;
      c.tState = state;
    }
    if (Owner === null) ;
    else if (Owner !== UNOWNED) {
      if (Transition && Transition.running && Owner.pure) {
        if (!Owner.tOwned) Owner.tOwned = [c];
        else Owner.tOwned.push(c);
      } else {
        if (!Owner.owned) Owner.owned = [c];
        else Owner.owned.push(c);
      }
    }
    if (ExternalSourceConfig && c.fn) {
      const sourceFn = c.fn;
      const [track, trigger] = createSignal(void 0, {
        equals: false
      });
      const ordinary = ExternalSourceConfig.factory(sourceFn, trigger);
      onCleanup(() => ordinary.dispose());
      let inTransition;
      const triggerInTransition = () => startTransition(trigger).then(() => {
        if (inTransition) {
          inTransition.dispose();
          inTransition = void 0;
        }
      });
      c.fn = (x2) => {
        track();
        if (Transition && Transition.running) {
          if (!inTransition) inTransition = ExternalSourceConfig.factory(sourceFn, triggerInTransition);
          return inTransition.track(x2);
        }
        return ordinary.track(x2);
      };
    }
    return c;
  }
  function runTop(node) {
    const runningTransition = Transition && Transition.running;
    if ((runningTransition ? node.tState : node.state) === 0) return;
    if ((runningTransition ? node.tState : node.state) === PENDING) return lookUpstream(node);
    if (node.suspense && untrack(node.suspense.inFallback)) return node.suspense.effects.push(node);
    const ancestors = [node];
    while ((node = node.owner) && (!node.updatedAt || node.updatedAt < ExecCount)) {
      if (runningTransition && Transition.disposed.has(node)) return;
      if (runningTransition ? node.tState : node.state) ancestors.push(node);
    }
    for (let i = ancestors.length - 1; i >= 0; i--) {
      node = ancestors[i];
      if (runningTransition) {
        let top = node, prev = ancestors[i + 1];
        while ((top = top.owner) && top !== prev) {
          if (Transition.disposed.has(top)) return;
        }
      }
      if ((runningTransition ? node.tState : node.state) === STALE) {
        updateComputation(node);
      } else if ((runningTransition ? node.tState : node.state) === PENDING) {
        const updates = Updates;
        Updates = null;
        runUpdates(() => lookUpstream(node, ancestors[0]), false);
        Updates = updates;
      }
    }
  }
  function runUpdates(fn, init2) {
    if (Updates) return fn();
    let wait = false;
    if (!init2) Updates = [];
    if (Effects) wait = true;
    else Effects = [];
    ExecCount++;
    try {
      const res = fn();
      completeUpdates(wait);
      return res;
    } catch (err) {
      if (!wait) Effects = null;
      Updates = null;
      handleError(err);
    }
  }
  function completeUpdates(wait) {
    if (Updates) {
      if (Scheduler && Transition && Transition.running) scheduleQueue(Updates);
      else runQueue(Updates);
      Updates = null;
    }
    if (wait) return;
    let res;
    if (Transition) {
      if (!Transition.promises.size && !Transition.queue.size) {
        const sources = Transition.sources;
        const disposed = Transition.disposed;
        Effects.push.apply(Effects, Transition.effects);
        res = Transition.resolve;
        for (const e2 of Effects) {
          "tState" in e2 && (e2.state = e2.tState);
          delete e2.tState;
        }
        Transition = null;
        runUpdates(() => {
          for (const d of disposed) cleanNode(d);
          for (const v of sources) {
            v.value = v.tValue;
            if (v.owned) {
              for (let i = 0, len = v.owned.length; i < len; i++) cleanNode(v.owned[i]);
            }
            if (v.tOwned) v.owned = v.tOwned;
            delete v.tValue;
            delete v.tOwned;
            v.tState = 0;
          }
          setTransPending(false);
        }, false);
      } else if (Transition.running) {
        Transition.running = false;
        Transition.effects.push.apply(Transition.effects, Effects);
        Effects = null;
        setTransPending(true);
        return;
      }
    }
    const e = Effects;
    Effects = null;
    if (e.length) runUpdates(() => runEffects(e), false);
    if (res) res();
  }
  function runQueue(queue) {
    for (let i = 0; i < queue.length; i++) runTop(queue[i]);
  }
  function scheduleQueue(queue) {
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      const tasks = Transition.queue;
      if (!tasks.has(item)) {
        tasks.add(item);
        Scheduler(() => {
          tasks.delete(item);
          runUpdates(() => {
            Transition.running = true;
            runTop(item);
          }, false);
          Transition && (Transition.running = false);
        });
      }
    }
  }
  function runUserEffects(queue) {
    let i, userLength = 0;
    for (i = 0; i < queue.length; i++) {
      const e = queue[i];
      if (!e.user) runTop(e);
      else queue[userLength++] = e;
    }
    if (sharedConfig.context) {
      if (sharedConfig.count) {
        sharedConfig.effects || (sharedConfig.effects = []);
        sharedConfig.effects.push(...queue.slice(0, userLength));
        return;
      }
      setHydrateContext();
    }
    if (sharedConfig.effects && (sharedConfig.done || !sharedConfig.count)) {
      queue = [...sharedConfig.effects, ...queue];
      userLength += sharedConfig.effects.length;
      delete sharedConfig.effects;
    }
    for (i = 0; i < userLength; i++) runTop(queue[i]);
  }
  function lookUpstream(node, ignore) {
    const runningTransition = Transition && Transition.running;
    if (runningTransition) node.tState = 0;
    else node.state = 0;
    for (let i = 0; i < node.sources.length; i += 1) {
      const source = node.sources[i];
      if (source.sources) {
        const state = runningTransition ? source.tState : source.state;
        if (state === STALE) {
          if (source !== ignore && (!source.updatedAt || source.updatedAt < ExecCount)) runTop(source);
        } else if (state === PENDING) lookUpstream(source, ignore);
      }
    }
  }
  function markDownstream(node) {
    const runningTransition = Transition && Transition.running;
    for (let i = 0; i < node.observers.length; i += 1) {
      const o = node.observers[i];
      if (runningTransition ? !o.tState : !o.state) {
        if (runningTransition) o.tState = PENDING;
        else o.state = PENDING;
        if (o.pure) Updates.push(o);
        else Effects.push(o);
        o.observers && markDownstream(o);
      }
    }
  }
  function cleanNode(node) {
    let i;
    if (node.sources) {
      while (node.sources.length) {
        const source = node.sources.pop(), index = node.sourceSlots.pop(), obs = source.observers;
        if (obs && obs.length) {
          const n = obs.pop(), s = source.observerSlots.pop();
          if (index < obs.length) {
            n.sourceSlots[s] = index;
            obs[index] = n;
            source.observerSlots[index] = s;
          }
        }
      }
    }
    if (node.tOwned) {
      for (i = node.tOwned.length - 1; i >= 0; i--) cleanNode(node.tOwned[i]);
      delete node.tOwned;
    }
    if (Transition && Transition.running && node.pure) {
      reset(node, true);
    } else if (node.owned) {
      for (i = node.owned.length - 1; i >= 0; i--) cleanNode(node.owned[i]);
      node.owned = null;
    }
    if (node.cleanups) {
      for (i = node.cleanups.length - 1; i >= 0; i--) node.cleanups[i]();
      node.cleanups = null;
    }
    if (Transition && Transition.running) node.tState = 0;
    else node.state = 0;
  }
  function reset(node, top) {
    if (!top) {
      node.tState = 0;
      Transition.disposed.add(node);
    }
    if (node.owned) {
      for (let i = 0; i < node.owned.length; i++) reset(node.owned[i]);
    }
  }
  function castError(err) {
    if (err instanceof Error) return err;
    return new Error(typeof err === "string" ? err : "Unknown error", {
      cause: err
    });
  }
  function runErrors(err, fns, owner) {
    try {
      for (const f of fns) f(err);
    } catch (e) {
      handleError(e, owner && owner.owner || null);
    }
  }
  function handleError(err, owner = Owner) {
    const fns = ERROR && owner && owner.context && owner.context[ERROR];
    const error = castError(err);
    if (!fns) throw error;
    if (Effects) Effects.push({
      fn() {
        runErrors(error, fns, owner);
      },
      state: STALE
    });
    else runErrors(error, fns, owner);
  }
  var FALLBACK = /* @__PURE__ */ Symbol("fallback");
  function dispose(d) {
    for (let i = 0; i < d.length; i++) d[i]();
  }
  function mapArray(list, mapFn, options = {}) {
    let items = [], mapped = [], disposers = [], len = 0, indexes = mapFn.length > 1 ? [] : null;
    onCleanup(() => dispose(disposers));
    return () => {
      let newItems = list() || [], newLen = newItems.length, i, j;
      newItems[$TRACK];
      return untrack(() => {
        let newIndices, newIndicesNext, temp, tempdisposers, tempIndexes, start, end, newEnd, item;
        if (newLen === 0) {
          if (len !== 0) {
            dispose(disposers);
            disposers = [];
            items = [];
            mapped = [];
            len = 0;
            indexes && (indexes = []);
          }
          if (options.fallback) {
            items = [FALLBACK];
            mapped[0] = createRoot((disposer) => {
              disposers[0] = disposer;
              return options.fallback();
            });
            len = 1;
          }
        } else if (len === 0) {
          mapped = new Array(newLen);
          for (j = 0; j < newLen; j++) {
            items[j] = newItems[j];
            mapped[j] = createRoot(mapper);
          }
          len = newLen;
        } else {
          temp = new Array(newLen);
          tempdisposers = new Array(newLen);
          indexes && (tempIndexes = new Array(newLen));
          for (start = 0, end = Math.min(len, newLen); start < end && items[start] === newItems[start]; start++) ;
          for (end = len - 1, newEnd = newLen - 1; end >= start && newEnd >= start && items[end] === newItems[newEnd]; end--, newEnd--) {
            temp[newEnd] = mapped[end];
            tempdisposers[newEnd] = disposers[end];
            indexes && (tempIndexes[newEnd] = indexes[end]);
          }
          newIndices = /* @__PURE__ */ new Map();
          newIndicesNext = new Array(newEnd + 1);
          for (j = newEnd; j >= start; j--) {
            item = newItems[j];
            i = newIndices.get(item);
            newIndicesNext[j] = i === void 0 ? -1 : i;
            newIndices.set(item, j);
          }
          for (i = start; i <= end; i++) {
            item = items[i];
            j = newIndices.get(item);
            if (j !== void 0 && j !== -1) {
              temp[j] = mapped[i];
              tempdisposers[j] = disposers[i];
              indexes && (tempIndexes[j] = indexes[i]);
              j = newIndicesNext[j];
              newIndices.set(item, j);
            } else disposers[i]();
          }
          for (j = start; j < newLen; j++) {
            if (j in temp) {
              mapped[j] = temp[j];
              disposers[j] = tempdisposers[j];
              if (indexes) {
                indexes[j] = tempIndexes[j];
                indexes[j](j);
              }
            } else mapped[j] = createRoot(mapper);
          }
          mapped = mapped.slice(0, len = newLen);
          items = newItems.slice(0);
        }
        return mapped;
      });
      function mapper(disposer) {
        disposers[j] = disposer;
        if (indexes) {
          const [s, set] = createSignal(j);
          indexes[j] = set;
          return mapFn(newItems[j], s);
        }
        return mapFn(newItems[j]);
      }
    };
  }
  var hydrationEnabled = false;
  function createComponent(Comp, props) {
    if (hydrationEnabled) {
      if (sharedConfig.context) {
        const c = sharedConfig.context;
        setHydrateContext(nextHydrateContext());
        const r = untrack(() => Comp(props || {}));
        setHydrateContext(c);
        return r;
      }
    }
    return untrack(() => Comp(props || {}));
  }
  var narrowedError = (name) => `Stale read from <${name}>.`;
  function For(props) {
    const fallback = "fallback" in props && {
      fallback: () => props.fallback
    };
    return createMemo(mapArray(() => props.each, props.children, fallback || void 0));
  }
  function Show(props) {
    const keyed = props.keyed;
    const conditionValue = createMemo(() => props.when, void 0, void 0);
    const condition = keyed ? conditionValue : createMemo(conditionValue, void 0, {
      equals: (a, b) => !a === !b
    });
    return createMemo(() => {
      const c = condition();
      if (c) {
        const child = props.children;
        const fn = typeof child === "function" && child.length > 0;
        return fn ? untrack(() => child(keyed ? c : () => {
          if (!untrack(condition)) throw narrowedError("Show");
          return conditionValue();
        })) : child;
      }
      return props.fallback;
    }, void 0, void 0);
  }

  // node_modules/.pnpm/solid-js@1.9.14/node_modules/solid-js/web/dist/web.js
  var booleans = [
    "allowfullscreen",
    "async",
    "alpha",
    "autofocus",
    "autoplay",
    "checked",
    "controls",
    "default",
    "disabled",
    "formnovalidate",
    "hidden",
    "indeterminate",
    "inert",
    "ismap",
    "loop",
    "multiple",
    "muted",
    "nomodule",
    "novalidate",
    "open",
    "playsinline",
    "readonly",
    "required",
    "reversed",
    "seamless",
    "selected",
    "adauctionheaders",
    "browsingtopics",
    "credentialless",
    "defaultchecked",
    "defaultmuted",
    "defaultselected",
    "defer",
    "disablepictureinpicture",
    "disableremoteplayback",
    "preservespitch",
    "shadowrootclonable",
    "shadowrootcustomelementregistry",
    "shadowrootdelegatesfocus",
    "shadowrootserializable",
    "sharedstoragewritable"
  ];
  var Properties = /* @__PURE__ */ new Set([
    "className",
    "value",
    "readOnly",
    "noValidate",
    "formNoValidate",
    "isMap",
    "noModule",
    "playsInline",
    "adAuctionHeaders",
    "allowFullscreen",
    "browsingTopics",
    "defaultChecked",
    "defaultMuted",
    "defaultSelected",
    "disablePictureInPicture",
    "disableRemotePlayback",
    "preservesPitch",
    "shadowRootClonable",
    "shadowRootCustomElementRegistry",
    "shadowRootDelegatesFocus",
    "shadowRootSerializable",
    "sharedStorageWritable",
    ...booleans
  ]);
  var memo = (fn) => createMemo(() => fn());
  function reconcileArrays(parentNode, a, b) {
    let bLength = b.length, aEnd = a.length, bEnd = bLength, aStart = 0, bStart = 0, after = a[aEnd - 1].nextSibling, map = null;
    while (aStart < aEnd || bStart < bEnd) {
      if (a[aStart] === b[bStart]) {
        aStart++;
        bStart++;
        continue;
      }
      while (a[aEnd - 1] === b[bEnd - 1]) {
        aEnd--;
        bEnd--;
      }
      if (aEnd === aStart) {
        const node = bEnd < bLength ? bStart ? b[bStart - 1].nextSibling : b[bEnd - bStart] : after;
        while (bStart < bEnd) parentNode.insertBefore(b[bStart++], node);
      } else if (bEnd === bStart) {
        while (aStart < aEnd) {
          if (!map || !map.has(a[aStart])) a[aStart].remove();
          aStart++;
        }
      } else if (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]) {
        const node = a[--aEnd].nextSibling;
        parentNode.insertBefore(b[bStart++], a[aStart++].nextSibling);
        parentNode.insertBefore(b[--bEnd], node);
        a[aEnd] = b[bEnd];
      } else {
        if (!map) {
          map = /* @__PURE__ */ new Map();
          let i = bStart;
          while (i < bEnd) map.set(b[i], i++);
        }
        const index = map.get(a[aStart]);
        if (index != null) {
          if (bStart < index && index < bEnd) {
            let i = aStart, sequence = 1, t;
            while (++i < aEnd && i < bEnd) {
              if ((t = map.get(a[i])) == null || t !== index + sequence) break;
              sequence++;
            }
            if (sequence > index - bStart) {
              const node = a[aStart];
              while (bStart < index) parentNode.insertBefore(b[bStart++], node);
            } else parentNode.replaceChild(b[bStart++], a[aStart++]);
          } else aStart++;
        } else a[aStart++].remove();
      }
    }
  }
  var $$EVENTS = "_$DX_DELEGATE";
  function render(code, element, init2, options = {}) {
    let disposer;
    createRoot((dispose2) => {
      disposer = dispose2;
      element === document ? code() : insert(element, code(), element.firstChild ? null : void 0, init2);
    }, options.owner);
    return () => {
      disposer();
      element.textContent = "";
    };
  }
  function template(html, isImportNode, isSVG, isMathML) {
    let node;
    const create = () => {
      const t = isMathML ? document.createElementNS("http://www.w3.org/1998/Math/MathML", "template") : document.createElement("template");
      t.innerHTML = html;
      return isSVG ? t.content.firstChild.firstChild : isMathML ? t.firstChild : t.content.firstChild;
    };
    const fn = isImportNode ? () => untrack(() => document.importNode(node || (node = create()), true)) : () => (node || (node = create())).cloneNode(true);
    fn.cloneNode = fn;
    return fn;
  }
  function delegateEvents(eventNames, document2 = window.document) {
    const e = document2[$$EVENTS] || (document2[$$EVENTS] = /* @__PURE__ */ new Set());
    for (let i = 0, l = eventNames.length; i < l; i++) {
      const name = eventNames[i];
      if (!e.has(name)) {
        e.add(name);
        document2.addEventListener(name, eventHandler);
      }
    }
  }
  function setAttribute(node, name, value) {
    if (isHydrating(node)) return;
    if (value == null) node.removeAttribute(name);
    else node.setAttribute(name, value);
  }
  function className(node, value) {
    if (isHydrating(node)) return;
    if (value == null) node.removeAttribute("class");
    else node.className = value;
  }
  function addEventListener(node, name, handler, delegate) {
    if (delegate) {
      if (Array.isArray(handler)) {
        node[`$$${name}`] = handler[0];
        node[`$$${name}Data`] = handler[1];
      } else node[`$$${name}`] = handler;
    } else if (Array.isArray(handler)) {
      const handlerFn = handler[0];
      node.addEventListener(name, handler[0] = (e) => handlerFn.call(node, handler[1], e));
    } else node.addEventListener(name, handler, typeof handler !== "function" && handler);
  }
  function style(node, value, prev) {
    if (!value) return prev ? setAttribute(node, "style") : value;
    const nodeStyle = node.style;
    if (typeof value === "string") return nodeStyle.cssText = value;
    typeof prev === "string" && (nodeStyle.cssText = prev = void 0);
    prev || (prev = {});
    value || (value = {});
    let v, s;
    for (s in prev) {
      value[s] == null && nodeStyle.removeProperty(s);
      delete prev[s];
    }
    for (s in value) {
      v = value[s];
      if (v !== prev[s]) {
        nodeStyle.setProperty(s, v);
        prev[s] = v;
      }
    }
    return prev;
  }
  function setStyleProperty(node, name, value) {
    value != null ? node.style.setProperty(name, value) : node.style.removeProperty(name);
  }
  function use(fn, element, arg) {
    return untrack(() => fn(element, arg));
  }
  function insert(parent, accessor, marker, initial) {
    if (marker !== void 0 && !initial) initial = [];
    if (typeof accessor !== "function") return insertExpression(parent, accessor, initial, marker);
    createRenderEffect((current) => insertExpression(parent, accessor(), current, marker), initial);
  }
  function isHydrating(node) {
    return !!sharedConfig.context && !sharedConfig.done && (!node || node.isConnected);
  }
  function eventHandler(e) {
    if (sharedConfig.registry && sharedConfig.events) {
      if (sharedConfig.events.find(([el, ev]) => ev === e)) return;
    }
    let node = e.target;
    const key = `$$${e.type}`;
    const oriTarget = e.target;
    const oriCurrentTarget = e.currentTarget;
    const retarget = (value) => Object.defineProperty(e, "target", {
      configurable: true,
      value
    });
    const handleNode = () => {
      const handler = node[key];
      if (handler && !node.disabled) {
        const data = node[`${key}Data`];
        data !== void 0 ? handler.call(node, data, e) : handler.call(node, e);
        if (e.cancelBubble) return;
      }
      node.host && typeof node.host !== "string" && !node.host._$host && node.contains(e.target) && retarget(node.host);
      return true;
    };
    const walkUpTree = () => {
      while (handleNode() && (node = node._$host || node.parentNode || node.host)) ;
    };
    Object.defineProperty(e, "currentTarget", {
      configurable: true,
      get() {
        return node || document;
      }
    });
    if (sharedConfig.registry && !sharedConfig.done) sharedConfig.done = _$HY.done = true;
    if (e.composedPath) {
      const path2 = e.composedPath();
      retarget(path2[0]);
      for (let i = 0; i < path2.length - 2; i++) {
        node = path2[i];
        if (!handleNode()) break;
        if (node._$host) {
          node = node._$host;
          walkUpTree();
          break;
        }
        if (node.parentNode === oriCurrentTarget) {
          break;
        }
      }
    } else walkUpTree();
    retarget(oriTarget);
  }
  function insertExpression(parent, value, current, marker, unwrapArray) {
    const hydrating = isHydrating(parent);
    if (hydrating) {
      !current && (current = [...parent.childNodes]);
      let cleaned = [];
      for (let i = 0; i < current.length; i++) {
        const node = current[i];
        if (node.nodeType === 8 && node.data.slice(0, 2) === "!$") node.remove();
        else cleaned.push(node);
      }
      current = cleaned;
    }
    while (typeof current === "function") current = current();
    if (value === current) return current;
    const t = typeof value, multi = marker !== void 0;
    parent = multi && current[0] && current[0].parentNode || parent;
    if (t === "string" || t === "number") {
      if (hydrating) return current;
      if (t === "number") {
        value = value.toString();
        if (value === current) return current;
      }
      if (multi) {
        let node = current[0];
        if (node && node.nodeType === 3) {
          node.data !== value && (node.data = value);
        } else node = document.createTextNode(value);
        current = cleanChildren(parent, current, marker, node);
      } else {
        if (current !== "" && typeof current === "string") {
          current = parent.firstChild.data = value;
        } else current = parent.textContent = value;
      }
    } else if (value == null || t === "boolean") {
      if (hydrating) return current;
      current = cleanChildren(parent, current, marker);
    } else if (t === "function") {
      createRenderEffect(() => {
        let v = value();
        while (typeof v === "function") v = v();
        current = insertExpression(parent, v, current, marker);
      });
      return () => current;
    } else if (Array.isArray(value)) {
      const array = [];
      const currentArray = current && Array.isArray(current);
      if (normalizeIncomingArray(array, value, current, unwrapArray)) {
        createRenderEffect(() => current = insertExpression(parent, array, current, marker, true));
        return () => current;
      }
      if (hydrating) {
        if (!array.length) return current;
        if (marker === void 0) return current = [...parent.childNodes];
        let node = array[0];
        if (node.parentNode !== parent) return current;
        const nodes = [node];
        while ((node = node.nextSibling) !== marker) nodes.push(node);
        return current = nodes;
      }
      if (array.length === 0) {
        current = cleanChildren(parent, current, marker);
        if (multi) return current;
      } else if (currentArray) {
        if (current.length === 0) {
          appendNodes(parent, array, marker);
        } else reconcileArrays(parent, current, array);
      } else {
        current && cleanChildren(parent);
        appendNodes(parent, array);
      }
      current = array;
    } else if (value.nodeType) {
      if (hydrating && value.parentNode) return current = multi ? [value] : value;
      if (Array.isArray(current)) {
        if (multi) return current = cleanChildren(parent, current, marker, value);
        cleanChildren(parent, current, null, value);
      } else if (current == null || current === "" || !parent.firstChild) {
        parent.appendChild(value);
      } else parent.replaceChild(value, parent.firstChild);
      current = value;
    } else ;
    return current;
  }
  function normalizeIncomingArray(normalized, array, current, unwrap2) {
    let dynamic = false;
    for (let i = 0, len = array.length; i < len; i++) {
      let item = array[i], prev = current && current[normalized.length], t;
      if (item == null || item === true || item === false) ;
      else if ((t = typeof item) === "object" && item.nodeType) {
        normalized.push(item);
      } else if (Array.isArray(item)) {
        dynamic = normalizeIncomingArray(normalized, item, prev) || dynamic;
      } else if (t === "function") {
        if (unwrap2) {
          while (typeof item === "function") item = item();
          dynamic = normalizeIncomingArray(normalized, Array.isArray(item) ? item : [item], Array.isArray(prev) ? prev : [prev]) || dynamic;
        } else {
          normalized.push(item);
          dynamic = true;
        }
      } else {
        const value = String(item);
        if (prev && prev.nodeType === 3 && prev.data === value) normalized.push(prev);
        else normalized.push(document.createTextNode(value));
      }
    }
    return dynamic;
  }
  function appendNodes(parent, array, marker = null) {
    for (let i = 0, len = array.length; i < len; i++) parent.insertBefore(array[i], marker);
  }
  function cleanChildren(parent, current, marker, replacement) {
    if (marker === void 0) return parent.textContent = "";
    const node = replacement || document.createTextNode("");
    if (current.length) {
      let inserted = false;
      for (let i = current.length - 1; i >= 0; i--) {
        const el = current[i];
        if (node !== el) {
          const isParent = el.parentNode === parent;
          if (!inserted && !i) isParent ? parent.replaceChild(node, el) : parent.insertBefore(node, marker);
          else isParent && el.remove();
        } else inserted = true;
      }
    } else parent.insertBefore(node, marker);
    return [node];
  }

  // webview/messaging.ts
  var api = null;
  function initMessaging(vsCodeApi) {
    api = vsCodeApi;
  }
  function postMessage(msg) {
    api?.postMessage(JSON.parse(JSON.stringify(msg)));
  }

  // node_modules/.pnpm/solid-js@1.9.14/node_modules/solid-js/store/dist/store.js
  var $RAW = /* @__PURE__ */ Symbol("store-raw");
  var $NODE = /* @__PURE__ */ Symbol("store-node");
  var $HAS = /* @__PURE__ */ Symbol("store-has");
  var $SELF = /* @__PURE__ */ Symbol("store-self");
  function wrap$1(value) {
    let p = value[$PROXY];
    if (!p) {
      Object.defineProperty(value, $PROXY, {
        value: p = new Proxy(value, proxyTraps$1)
      });
      if (!Array.isArray(value)) {
        const keys = Object.keys(value), desc = Object.getOwnPropertyDescriptors(value), proto = Object.getPrototypeOf(value);
        const isClass = proto !== null && value !== null && typeof value === "object" && !Array.isArray(value) && proto !== Object.prototype;
        if (isClass) {
          const descriptors = Object.getOwnPropertyDescriptors(proto);
          keys.push(...Object.keys(descriptors));
          Object.assign(desc, descriptors);
        }
        for (let i = 0, l = keys.length; i < l; i++) {
          const prop = keys[i];
          if (isClass && prop === "constructor") continue;
          if (desc[prop].get) {
            Object.defineProperty(value, prop, {
              configurable: true,
              enumerable: desc[prop].enumerable,
              get: desc[prop].get.bind(p)
            });
          }
        }
      }
    }
    return p;
  }
  function isWrappable(obj) {
    let proto;
    return obj != null && typeof obj === "object" && (obj[$PROXY] || !(proto = Object.getPrototypeOf(obj)) || proto === Object.prototype || Array.isArray(obj));
  }
  function unwrap(item, set = /* @__PURE__ */ new Set()) {
    let result, unwrapped, v, prop;
    if (result = item != null && item[$RAW]) return result;
    if (!isWrappable(item) || set.has(item)) return item;
    if (Array.isArray(item)) {
      if (Object.isFrozen(item)) item = item.slice(0);
      else set.add(item);
      for (let i = 0, l = item.length; i < l; i++) {
        v = item[i];
        if ((unwrapped = unwrap(v, set)) !== v) item[i] = unwrapped;
      }
    } else {
      if (Object.isFrozen(item)) item = Object.assign({}, item);
      else set.add(item);
      const keys = Object.keys(item), desc = Object.getOwnPropertyDescriptors(item);
      for (let i = 0, l = keys.length; i < l; i++) {
        prop = keys[i];
        if (desc[prop].get) continue;
        v = item[prop];
        if ((unwrapped = unwrap(v, set)) !== v) item[prop] = unwrapped;
      }
    }
    return item;
  }
  function getNodes(target, symbol) {
    let nodes = target[symbol];
    if (!nodes) Object.defineProperty(target, symbol, {
      value: nodes = /* @__PURE__ */ Object.create(null)
    });
    return nodes;
  }
  function getNode(nodes, property, value) {
    if (nodes[property]) return nodes[property];
    const [s, set] = createSignal(value, {
      equals: false,
      internal: true
    });
    s.$ = set;
    return nodes[property] = s;
  }
  function proxyDescriptor$1(target, property) {
    const desc = Reflect.getOwnPropertyDescriptor(target, property);
    if (!desc || desc.get || !desc.configurable || property === $PROXY || property === $NODE) return desc;
    delete desc.value;
    delete desc.writable;
    desc.get = () => target[$PROXY][property];
    return desc;
  }
  function trackSelf(target) {
    getListener() && getNode(getNodes(target, $NODE), $SELF)();
  }
  function ownKeys(target) {
    trackSelf(target);
    return Reflect.ownKeys(target);
  }
  var proxyTraps$1 = {
    get(target, property, receiver) {
      if (property === $RAW) return target;
      if (property === $PROXY) return receiver;
      if (property === $TRACK) {
        trackSelf(target);
        return receiver;
      }
      const nodes = getNodes(target, $NODE);
      const tracked = nodes[property];
      let value = tracked ? tracked() : target[property];
      if (property === $NODE || property === $HAS || property === "__proto__") return value;
      if (!tracked) {
        const desc = Object.getOwnPropertyDescriptor(target, property);
        if (getListener() && (typeof value !== "function" || Object.prototype.hasOwnProperty.call(target, property)) && !(desc && desc.get)) value = getNode(nodes, property, value)();
      }
      return isWrappable(value) ? wrap$1(value) : value;
    },
    has(target, property) {
      if (property === $RAW || property === $PROXY || property === $TRACK || property === $NODE || property === $HAS || property === "__proto__") return true;
      getListener() && getNode(getNodes(target, $HAS), property)();
      return property in target;
    },
    set() {
      return true;
    },
    deleteProperty() {
      return true;
    },
    ownKeys,
    getOwnPropertyDescriptor: proxyDescriptor$1
  };
  function setProperty(state, property, value, deleting = false) {
    if (property === "__proto__") {
      return;
    }
    if (!deleting && state[property] === value) return;
    const prev = state[property], len = state.length;
    if (value === void 0) {
      delete state[property];
      if (state[$HAS] && state[$HAS][property] && prev !== void 0) state[$HAS][property].$();
    } else {
      state[property] = value;
      if (state[$HAS] && state[$HAS][property] && prev === void 0) state[$HAS][property].$();
    }
    let nodes = getNodes(state, $NODE), node;
    if (node = getNode(nodes, property, prev)) node.$(() => value);
    if (Array.isArray(state) && state.length !== len) {
      for (let i = state.length; i < len; i++) (node = nodes[i]) && node.$();
      (node = getNode(nodes, "length", len)) && node.$(state.length);
    }
    (node = nodes[$SELF]) && node.$();
  }
  function mergeStoreNode(state, value) {
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (isUnsafeKey$1(key)) continue;
      setProperty(state, key, value[key]);
    }
  }
  function isUnsafeKey$1(property) {
    return property === "__proto__" || property === "constructor" || property === "prototype";
  }
  function updateArray(current, next) {
    if (typeof next === "function") next = next(current);
    next = unwrap(next);
    if (Array.isArray(next)) {
      if (current === next) return;
      let i = 0, len = next.length;
      for (; i < len; i++) {
        const value = next[i];
        if (current[i] !== value) setProperty(current, i, value);
      }
      setProperty(current, "length", len);
    } else mergeStoreNode(current, next);
  }
  function updatePath(current, path2, traversed = []) {
    let part, prev = current;
    if (path2.length > 1) {
      part = path2.shift();
      const partType = typeof part, isArray = Array.isArray(current);
      if (partType === "string" && (part === "__proto__" || path2.length > 1 && isUnsafeKey$1(part))) {
        return;
      }
      if (Array.isArray(part)) {
        for (let i = 0; i < part.length; i++) {
          updatePath(current, [part[i]].concat(path2), traversed);
        }
        return;
      } else if (isArray && partType === "function") {
        for (let i = 0; i < current.length; i++) {
          if (part(current[i], i)) updatePath(current, [i].concat(path2), traversed);
        }
        return;
      } else if (isArray && partType === "object") {
        const {
          from = 0,
          to = current.length - 1,
          by = 1
        } = part;
        for (let i = from; i <= to; i += by) {
          updatePath(current, [i].concat(path2), traversed);
        }
        return;
      } else if (path2.length > 1) {
        updatePath(current[part], path2, [part].concat(traversed));
        return;
      }
      prev = current[part];
      traversed = [part].concat(traversed);
    }
    let value = path2[0];
    if (typeof value === "function") {
      value = value(prev, traversed);
      if (value === prev) return;
    }
    if (part === void 0 && value == void 0) return;
    value = unwrap(value);
    if (part === void 0 || isWrappable(prev) && isWrappable(value) && !Array.isArray(value)) {
      mergeStoreNode(prev, value);
    } else setProperty(current, part, value);
  }
  function createStore(...[store2, options]) {
    const unwrappedStore = unwrap(store2 || {});
    const isArray = Array.isArray(unwrappedStore);
    const wrappedStore = wrap$1(unwrappedStore);
    function setStore2(...args) {
      batch(() => {
        isArray && args.length === 1 ? updateArray(unwrappedStore, args[0]) : updatePath(unwrappedStore, args);
      });
    }
    return [wrappedStore, setStore2];
  }

  // src/shared/dates.ts
  function startOfDay(t) {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  function startOfDayAt(t, boundary) {
    if (boundary === "utc") {
      return Math.floor(t / 864e5) * 864e5;
    }
    return startOfDay(t);
  }

  // webview/logic/format.ts
  function sym(c) {
    return c === "CNY" ? "\xA5" : c === "USD" ? "$" : `${c || ""} `;
  }
  function fmtMoney(n, currency) {
    return `${sym(currency)}${Number(n).toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }
  function fmtAxisMoney(v, currency) {
    return `${sym(currency)}${Number(v).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
  }
  function pad(n) {
    return String(n).padStart(2, "0");
  }
  function fmtClock(t) {
    const d = new Date(t);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function fmtDay(t) {
    const d = new Date(t);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function fmtDayShort(t) {
    const d = new Date(t);
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function fmtMonth(t) {
    const d = new Date(t);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }

  // webview/logic/viewport.ts
  var VIEWS = {
    hourly: {
      label: "\u5206\u65F6",
      ranges: [
        { key: "1h", label: "1 \u5C0F\u65F6", ms: 36e5 },
        { key: "6h", label: "6 \u5C0F\u65F6", ms: 6 * 36e5 },
        { key: "24h", label: "24 \u5C0F\u65F6", ms: 24 * 36e5 },
        { key: "7d", label: "7 \u5929", ms: 7 * 864e5 }
      ],
      defaultRange: "6h",
      tickLabel: "time"
    },
    daily: {
      label: "\u5206\u5929",
      ranges: [
        { key: "7d", label: "7 \u5929", ms: 7 * 864e5 },
        { key: "30d", label: "30 \u5929", ms: 30 * 864e5 },
        { key: "90d", label: "90 \u5929", ms: 90 * 864e5 },
        { key: "all", label: "\u5168\u90E8", ms: Infinity }
      ],
      defaultRange: "30d",
      tickLabel: "day"
    },
    monthly: {
      label: "\u5206\u6708",
      ranges: [
        { key: "6m", label: "6 \u4E2A\u6708", ms: 6 * 30 * 864e5 },
        { key: "12m", label: "12 \u4E2A\u6708", ms: 12 * 30 * 864e5 },
        { key: "all", label: "\u5168\u90E8", ms: Infinity }
      ],
      defaultRange: "12m",
      tickLabel: "month"
    }
  };
  var MIN_WINDOW_MS = {
    hourly: 15 * 6e4,
    daily: 6 * 36e5,
    monthly: 7 * 864e5
  };
  function currentRangeMs(view, rangeKey) {
    const cfg = VIEWS[view];
    const r = cfg.ranges.find((x2) => x2.key === rangeKey) || cfg.ranges[0];
    return r ? r.ms : Infinity;
  }
  function viewPoints(data, view) {
    if (!data) return [];
    if (view === "hourly") {
      return data.snapshots.slice();
    }
    if (view === "daily") {
      return data.daily.slice().map((x2) => ({
        t: x2.day,
        total: x2.total,
        toppedUp: x2.toppedUp,
        granted: x2.granted,
        currency: x2.currency
      }));
    }
    const byMonth = /* @__PURE__ */ new Map();
    for (const x2 of data.daily) {
      const m = startOfDay(new Date(x2.day).setDate(1));
      byMonth.set(m, x2);
    }
    return Array.from(byMonth.entries()).sort((a, b) => a[0] - b[0]).map(([t, x2]) => ({
      t,
      total: x2.total,
      toppedUp: x2.toppedUp,
      granted: x2.granted,
      currency: x2.currency
    }));
  }
  function computeDataBounds(data, view) {
    const pts = viewPoints(data, view);
    if (!pts.length) return null;
    return { minT: pts[0].t, maxT: pts[pts.length - 1].t };
  }
  function resetViewRange(data, view, rangeKey) {
    const bounds = computeDataBounds(data, view);
    if (!bounds) {
      return { viewRange: null };
    }
    const ms = currentRangeMs(view, rangeKey);
    const span = Math.max(bounds.maxT - bounds.minT, 6e4);
    const maxWindow = Math.max(ms === Infinity ? span : ms, span);
    const minWindow = MIN_WINDOW_MS[view];
    let start;
    let end;
    if (ms === Infinity) {
      const padAmt = span * 0.03;
      start = bounds.minT - padAmt;
      end = bounds.maxT + padAmt;
    } else {
      end = bounds.maxT;
      start = end - ms;
    }
    return { viewRange: { start, end }, followLive: true, maxWindow, minWindow };
  }
  function clampRange(start, end, bounds, minWindow) {
    let dur = end - start;
    if (dur < minWindow) {
      end = start + minWindow;
      dur = end - start;
    }
    const hi = bounds.maxT + (bounds.maxT - bounds.minT) * 0.05;
    let s = Math.max(bounds.minT, Math.min(start, hi - dur));
    let e = s + dur;
    if (e > hi) {
      e = hi;
      s = e - dur;
    }
    if (s < bounds.minT) {
      s = bounds.minT;
      e = s + dur;
    }
    return { start: s, end: e };
  }
  function onNewData(data, vs) {
    const bounds = computeDataBounds(data, vs.view);
    if (!bounds) return {};
    if (!vs.viewRange) {
      return resetViewRange(data, vs.view, vs.rangeKey);
    }
    if (vs.followLive && bounds.maxT > vs.viewRange.end) {
      const width = vs.viewRange.end - vs.viewRange.start;
      return { viewRange: { start: bounds.maxT - width, end: bounds.maxT } };
    }
    return {};
  }
  function upsertDailyLocal(daily, s) {
    const day = startOfDay(s.t);
    const ex = daily.find((d) => d.day === day);
    if (ex) {
      return daily.map(
        (d) => d.day === day ? {
          ...d,
          total: s.total,
          toppedUp: s.toppedUp,
          granted: s.granted,
          currency: s.currency
        } : d
      );
    }
    const next = [
      ...daily,
      { day, total: s.total, toppedUp: s.toppedUp, granted: s.granted, currency: s.currency }
    ];
    next.sort((a, b) => a.day - b.day);
    return next;
  }

  // webview/logic/todaySpend.ts
  var EPS = 1e-6;
  function findBaseline(data, todayStart) {
    const yesterdayStart = todayStart - 864e5;
    let prevTotal = null;
    for (const s of data.snapshots) {
      if (s.t >= todayStart) break;
      if (s.t >= yesterdayStart) prevTotal = s.total;
    }
    if (prevTotal !== null) {
      return { baseline: prevTotal, source: "\u6628\u65E5\u4F59\u989D" };
    }
    const firstToday = data.snapshots.find((s) => s.t >= todayStart);
    if (firstToday) {
      return { baseline: firstToday.total, source: "\u4ECA\u65E5\u9996\u6761\u5FEB\u7167" };
    }
    return null;
  }
  function scanToday(snapshots, todayStart, baseline) {
    let recharge = 0;
    let prev = baseline;
    let lastT = 0;
    for (const s of snapshots) {
      if (s.t < todayStart) continue;
      const gain = s.total - prev;
      if (gain > EPS) recharge += gain;
      prev = s.total;
      lastT = s.t;
    }
    return [recharge, prev, lastT];
  }
  function buildTodaySpendCache(data, now = Date.now(), boundary = "local") {
    if (!data || !data.snapshots.length) return null;
    const snapshots = data.snapshots;
    const todayStart = startOfDayAt(snapshots[snapshots.length - 1].t, boundary);
    if (todayStart !== startOfDayAt(now, boundary)) return null;
    const base = findBaseline(data, todayStart);
    if (!base) return null;
    const [recharge, prevTotal, lastT] = scanToday(snapshots, todayStart, base.baseline);
    return {
      day: todayStart,
      boundary,
      baseline: base.baseline,
      source: base.source,
      recharge,
      lastT,
      prevTotal
    };
  }
  function advanceTodaySpendCache(cache, data, now = Date.now(), boundary = "local") {
    if (!data || !data.snapshots.length) return cache;
    const snapshots = data.snapshots;
    const day = startOfDayAt(snapshots[snapshots.length - 1].t, boundary);
    if (!cache || cache.day !== day || cache.boundary !== boundary) {
      return buildTodaySpendCache(data, now, boundary);
    }
    let i = snapshots.length - 1;
    while (i >= 0 && snapshots[i].t > cache.lastT) i--;
    let { recharge, prevTotal } = cache;
    let lastT = cache.lastT;
    for (let j = i + 1; j < snapshots.length; j++) {
      const s = snapshots[j];
      const gain = s.total - prevTotal;
      if (gain > EPS) recharge += gain;
      prevTotal = s.total;
      lastT = s.t;
    }
    return { ...cache, recharge, lastT, prevTotal };
  }
  function todaySpendFromCache(cache, current) {
    if (!cache || !current) return null;
    const spend = cache.baseline + cache.recharge - current.total;
    if (!Number.isFinite(spend)) return null;
    if (spend < 0) {
      if (spend > -EPS) return { spend: 0, source: cache.source, baseline: cache.baseline };
      return null;
    }
    return { spend, source: cache.source, baseline: cache.baseline };
  }

  // webview/store.ts
  var [store, setStore] = createStore({
    data: null,
    config: null,
    view: "hourly",
    rangeKey: null,
    viewRange: null,
    followLive: true,
    maxWindow: 0,
    minWindow: 6e4,
    lastError: "",
    settingsOpen: false,
    themeTick: 0,
    refreshing: false,
    refreshResult: null,
    yMinSpanRatio: 0.2,
    chartMode: "spend",
    consGran: "hour",
    todayCache: null
  });
  var [tooltipInfo, setTooltipInfo] = createSignal(null);
  function stagedFromConfig(cfg) {
    return cfg ? {
      statusBarShow: !!cfg.statusBarShow,
      defaultColor: cfg.defaultColor || "",
      thresholds: (cfg.thresholds || []).map((t) => ({ below: t.below, color: t.color })),
      pollMinutes: cfg.pollMinutes || 1,
      rawRetentionDays: cfg.rawRetentionDays || 7,
      showTodaySpend: !!cfg.showTodaySpend,
      connectorStyle: cfg.connectorStyle || "dashed",
      connectorColor: cfg.connectorColor || "",
      lineStyle: cfg.lineStyle || "straight",
      dayBoundary: cfg.dayBoundary || "local"
    } : {
      statusBarShow: true,
      defaultColor: "",
      thresholds: [],
      pollMinutes: 1,
      rawRetentionDays: 7,
      showTodaySpend: false,
      connectorStyle: "dashed",
      connectorColor: "",
      lineStyle: "straight",
      dayBoundary: "local"
    };
  }
  var [spendPreview, setSpendPreview] = createSignal(null);
  function viewState() {
    return {
      view: store.view,
      rangeKey: store.rangeKey,
      viewRange: store.viewRange,
      followLive: store.followLive,
      maxWindow: store.maxWindow,
      minWindow: store.minWindow
    };
  }
  function applyResetPatch(r, fallback) {
    setStore({
      viewRange: r.viewRange,
      followLive: r.followLive ?? fallback.followLive,
      maxWindow: r.maxWindow ?? fallback.maxWindow,
      minWindow: r.minWindow ?? fallback.minWindow
    });
  }
  function init(payload) {
    setTooltipInfo(null);
    const view = "hourly";
    const rangeKey = VIEWS[view].defaultRange;
    const r = resetViewRange(payload, view, rangeKey);
    setStore({
      data: payload,
      config: payload.config || null,
      view,
      rangeKey,
      viewRange: r.viewRange,
      followLive: r.followLive ?? true,
      maxWindow: r.maxWindow ?? 0,
      minWindow: r.minWindow ?? 6e4,
      yMinSpanRatio: payload.yMinSpanRatio ?? 0.2,
      chartMode: payload.chartMode ?? "spend",
      consGran: "hour",
      todayCache: buildTodaySpendCache(
        payload,
        Date.now(),
        payload.config?.dayBoundary ?? "local"
      ),
      lastError: ""
    });
  }
  function onSnapshot(s) {
    if (!store.data) return;
    const daily = upsertDailyLocal(store.data.daily, s);
    const prev = store.data.snapshots;
    const snapshots = prev.length === 0 || s.t >= prev[prev.length - 1].t ? [...prev, s] : [...prev, s].sort((a, b) => a.t - b.t);
    const data = {
      ...store.data,
      snapshots,
      daily,
      current: s
    };
    const patch = onNewData(data, viewState());
    setStore({
      data,
      todayCache: advanceTodaySpendCache(
        store.todayCache,
        data,
        Date.now(),
        store.config?.dayBoundary ?? "local"
      ),
      ...patch,
      // 刷新成功（手动或自动轮询）即清除之前的错误提示，避免 ⚠ 一直挂着
      lastError: "",
      ...store.refreshing ? { refreshing: false, refreshResult: "ok" } : {}
    });
  }
  function onConfig(cfg) {
    const prev = store.config?.dayBoundary ?? "local";
    const next = cfg?.dayBoundary ?? "local";
    setStore({
      config: cfg,
      // 日界时区切换：todayCache 需按新日界重建（下次 snapshot 也会重建，这里立即生效）
      ...prev !== next ? { todayCache: buildTodaySpendCache(store.data, Date.now(), next) } : {}
    });
  }
  function applySavedConfig(p) {
    const prev = store.config?.dayBoundary ?? "local";
    const next = p.dayBoundary ?? "local";
    setStore("config", (cfg) => cfg ? { ...cfg, ...p } : cfg);
    if (prev !== next) {
      setStore({ todayCache: buildTodaySpendCache(store.data, Date.now(), next) });
    }
  }
  function setYMinSpanRatio(ratio) {
    setStore({ yMinSpanRatio: ratio });
  }
  function setChartMode(mode) {
    setStore({ chartMode: mode });
    setTooltipInfo(null);
    postMessage({ type: "setChartMode", payload: { mode } });
  }
  function setConsGran(g) {
    setStore({ consGran: g });
    setTooltipInfo(null);
  }
  function onSettingsReset() {
    setStore({ settingsOpen: false, yMinSpanRatio: 0.2, chartMode: "spend" });
  }
  function onError(message) {
    setStore({
      lastError: message,
      ...store.refreshing ? { refreshing: false, refreshResult: "fail" } : {}
    });
  }
  function onTheme() {
    setStore("themeTick", (t) => t + 1);
  }
  function setView(view) {
    if (store.view === view) return;
    setTooltipInfo(null);
    const rangeKey = VIEWS[view].defaultRange;
    const r = resetViewRange(store.data, view, rangeKey);
    setStore({
      view,
      rangeKey,
      viewRange: r.viewRange,
      followLive: r.followLive ?? store.followLive,
      maxWindow: r.maxWindow ?? store.maxWindow,
      minWindow: r.minWindow ?? store.minWindow
    });
  }
  function setRange(rangeKey) {
    const r = resetViewRange(store.data, store.view, rangeKey);
    applyResetPatch(r, store);
    setStore({ rangeKey });
  }
  function resetView() {
    const r = resetViewRange(store.data, store.view, store.rangeKey);
    applyResetPatch(r, store);
  }
  function setViewRange(vr, followLive) {
    setStore({ viewRange: vr, followLive });
  }
  function openSettings() {
    setStore({ settingsOpen: true });
  }
  function closeSettings() {
    setStore({ settingsOpen: false });
  }
  function checkNow() {
    setStore({ refreshing: true, refreshResult: null });
    postMessage({ type: "checkNow" });
  }
  function clearRefreshFeedback() {
    setStore({ refreshResult: null });
  }
  function openUsage() {
    postMessage({ type: "openUsage" });
  }
  function openStatusPage() {
    postMessage({ type: "openStatusPage" });
  }
  function setApiKey() {
    postMessage({ type: "setApiKey" });
  }
  function emptyInfo() {
    const data = store.data;
    if (!data) return { msg: "\u52A0\u8F7D\u4E2D\u2026", showAction: false };
    if (!viewPoints(data, store.view).length) {
      const total = (data.snapshots || []).length + (data.daily || []).length;
      if (total === 0) {
        return data.hasKey ? { msg: "\u7B49\u5F85\u9996\u6B21\u67E5\u8BE2\u7ED3\u679C\u2026", showAction: false } : { msg: "\u672A\u914D\u7F6E API Key", showAction: true };
      }
      return { msg: "\u8BE5\u89C6\u56FE\u6682\u65E0\u6570\u636E", showAction: false };
    }
    return null;
  }

  // webview/components/Header.tsx
  var _tmpl$ = /* @__PURE__ */ template(`<div class=stat><span class=stat-label>\u4ECA\u65E5\u82B1\u8D39</span><span class=stat-value>`);
  var _tmpl$2 = /* @__PURE__ */ template(`<div class=head-left><div class=stats><div class=stat><span class=stat-label>\u5F53\u524D\u4F59\u989D</span><span class=stat-value></span></div></div><div class=current-meta><span class=meta>`);
  function Header() {
    const balance = createMemo(() => {
      const cur = store.data && store.data.current;
      return cur ? fmtMoney(cur.total, cur.currency) : "--";
    });
    const meta = createMemo(() => {
      const cur = store.data && store.data.current;
      if (cur) {
        return `\u5145\u503C ${fmtMoney(cur.toppedUp, cur.currency)} \xB7 \u8D60\u9001 ${fmtMoney(cur.granted, cur.currency)}`;
      }
      return store.data && store.data.hasKey ? "\u7B49\u5F85\u6570\u636E\u2026" : "\u672A\u914D\u7F6E API Key";
    });
    const showSpend = createMemo(() => spendPreview() !== null ? spendPreview() : !!(store.config && store.config.showTodaySpend));
    const spend = createMemo(() => {
      if (!showSpend()) return null;
      const info = todaySpendFromCache(store.todayCache, store.data && store.data.current || null);
      if (!info) {
        return {
          value: "-",
          title: "\u6570\u636E\u4E0D\u8DB3\u6216\u542B\u5145\u503C\uFF0C\u65E0\u6CD5\u53EF\u9760\u4F30\u7B97\u4ECA\u65E5\u82B1\u8D39"
        };
      }
      const currency = store.data && store.data.current && store.data.current.currency || "CNY";
      const boundary = store.config?.dayBoundary ?? "local";
      return {
        value: `~${fmtMoney(info.spend, currency)}`,
        title: `\u4F30\u7B97\uFF1A\u57FA\u4E8E${info.source} \xA5${info.baseline} \u63A8\u7B97\uFF08\u5DF2\u6309\u4ECA\u65E5\u5145\u503C\u6821\u6B63\uFF0C${boundary === "utc" ? "UTC \u65E5\u754C" : "\u672C\u5730\u65E5\u754C"}\uFF09`
      };
    });
    return (() => {
      var _el$ = _tmpl$2(), _el$2 = _el$.firstChild, _el$3 = _el$2.firstChild, _el$4 = _el$3.firstChild, _el$5 = _el$4.nextSibling, _el$9 = _el$2.nextSibling, _el$0 = _el$9.firstChild;
      insert(_el$5, balance);
      insert(_el$2, createComponent(Show, {
        get when() {
          return spend();
        },
        get children() {
          var _el$6 = _tmpl$(), _el$7 = _el$6.firstChild, _el$8 = _el$7.nextSibling;
          insert(_el$8, () => spend().value);
          createRenderEffect(() => setAttribute(_el$6, "title", spend().title));
          return _el$6;
        }
      }), null);
      insert(_el$0, meta);
      return _el$;
    })();
  }

  // webview/components/Tabs.tsx
  var _tmpl$3 = /* @__PURE__ */ template(`<div class=tabs id=tabs>`);
  var _tmpl$22 = /* @__PURE__ */ template(`<button>`);
  var CONS_GRANS = {
    hour: {
      label: "\u5C0F\u65F6"
    },
    day: {
      label: "\u5468"
    },
    month: {
      label: "\u6708"
    }
  };
  function Tabs() {
    return (() => {
      var _el$ = _tmpl$3();
      insert(_el$, createComponent(Show, {
        get when() {
          return store.chartMode === "balance";
        },
        get fallback() {
          return createComponent(For, {
            get each() {
              return Object.entries(CONS_GRANS);
            },
            children: ([key, cfg]) => (() => {
              var _el$2 = _tmpl$22();
              _el$2.$$click = () => setConsGran(key);
              insert(_el$2, () => cfg.label);
              createRenderEffect(() => className(_el$2, "tab" + (key === store.consGran ? " active" : "")));
              return _el$2;
            })()
          });
        },
        get children() {
          return createComponent(For, {
            get each() {
              return Object.entries(VIEWS);
            },
            children: ([key, cfg]) => (() => {
              var _el$3 = _tmpl$22();
              _el$3.$$click = () => setView(key);
              insert(_el$3, () => cfg.label);
              createRenderEffect(() => className(_el$3, "tab" + (key === store.view ? " active" : "")));
              return _el$3;
            })()
          });
        }
      }));
      return _el$;
    })();
  }
  delegateEvents(["click"]);

  // webview/components/Ranges.tsx
  var _tmpl$4 = /* @__PURE__ */ template(`<div class=ranges id=ranges>`);
  var _tmpl$23 = /* @__PURE__ */ template(`<button>`);
  function Ranges() {
    return (() => {
      var _el$ = _tmpl$4();
      insert(_el$, createComponent(For, {
        get each() {
          return VIEWS[store.view].ranges;
        },
        children: (r) => (() => {
          var _el$2 = _tmpl$23();
          _el$2.$$click = () => setRange(r.key);
          insert(_el$2, () => r.label);
          createRenderEffect(() => className(_el$2, "btn small" + (r.key === store.rangeKey ? " primary" : "")));
          return _el$2;
        })()
      }));
      return _el$;
    })();
  }
  delegateEvents(["click"]);

  // webview/components/Footer.tsx
  var _tmpl$5 = /* @__PURE__ */ template(`<span>`);
  var _tmpl$24 = /* @__PURE__ */ template(`<span class=footer-right><span class=err></span><div class=tabs title="\u56FE\u8868\u6A21\u5F0F\uFF1A\u4F59\u989D\u66F2\u7EBF / \u6D88\u8017\u67F1\u72B6\u56FE"><button>\u4F59\u989D</button><button>\u6D88\u8017</button></div><button class=btn title="\u6253\u5F00 DeepSeek \u72B6\u6001\u9875"><i class="codicon codicon-pulse"></i>\u72B6\u6001</button><button class=btn title=\u8BBE\u7F6E><i class="codicon codicon-gear"></i>\u8BBE\u7F6E`);
  function Footer() {
    const info = createMemo(() => {
      const d = store.data;
      if (!d) return "";
      const count = (d.snapshots || []).length;
      const last = d.current;
      const lastStr = last ? `\u4E0A\u6B21\u540C\u6B65 ${new Date(last.t).toLocaleTimeString("zh-CN", {
        hour12: false
      })}` : "";
      return `\u4EC5\u8BB0\u5F55 VS Code \u6253\u5F00\u671F\u95F4\u7684\u6570\u636E \xB7 \u8F6E\u8BE2\u95F4\u9694 ${store.config ? store.config.pollMinutes : 1} \u5206\u949F \xB7 \u5FEB\u7167 ${count} \u6761 \xB7 ${lastStr}`;
    });
    return [(() => {
      var _el$ = _tmpl$5();
      insert(_el$, info);
      return _el$;
    })(), (() => {
      var _el$2 = _tmpl$24(), _el$3 = _el$2.firstChild, _el$4 = _el$3.nextSibling, _el$5 = _el$4.firstChild, _el$6 = _el$5.nextSibling, _el$7 = _el$4.nextSibling, _el$8 = _el$7.nextSibling;
      insert(_el$3, (() => {
        var _c$ = memo(() => !!store.lastError);
        return () => _c$() ? `\u26A0 ${store.lastError}` : "";
      })());
      _el$5.$$click = () => setChartMode("balance");
      _el$6.$$click = () => setChartMode("spend");
      addEventListener(_el$7, "click", openStatusPage, true);
      addEventListener(_el$8, "click", openSettings, true);
      createRenderEffect((_p$) => {
        var _v$ = "tab" + (store.chartMode === "balance" ? " active" : ""), _v$2 = "tab" + (store.chartMode === "spend" ? " active" : "");
        _v$ !== _p$.e && className(_el$5, _p$.e = _v$);
        _v$2 !== _p$.t && className(_el$6, _p$.t = _v$2);
        return _p$;
      }, {
        e: void 0,
        t: void 0
      });
      return _el$2;
    })()];
  }
  delegateEvents(["click"]);

  // webview/logic/segments.ts
  function decimate(pts, max) {
    if (pts.length <= max) return pts;
    const out = [];
    const bucket = Math.ceil(pts.length / max);
    for (let i = 0; i < pts.length; i += bucket) {
      const slice2 = pts.slice(i, i + bucket);
      let minP = slice2[0];
      let maxP = slice2[0];
      for (const p of slice2) {
        if (p.total < minP.total) minP = p;
        if (p.total > maxP.total) maxP = p;
      }
      out.push(slice2[0]);
      if (minP !== slice2[0] && minP !== slice2[slice2.length - 1]) out.push(minP);
      if (maxP !== slice2[0] && maxP !== slice2[slice2.length - 1] && maxP !== minP) out.push(maxP);
      out.push(slice2[slice2.length - 1]);
    }
    return out;
  }
  function medianDt(pts) {
    if (pts.length < 2) return 0;
    const ds = [];
    for (let i = 1; i < pts.length; i++) ds.push(pts[i].t - pts[i - 1].t);
    ds.sort((a, b) => a - b);
    return ds[Math.floor(ds.length / 2)];
  }
  function effectiveGapMs(pts, view) {
    if (view === "hourly") {
      return Math.max(10 * 6e4, medianDt(pts) * 3);
    }
    return view === "daily" ? 2 * 864e5 : 60 * 864e5;
  }
  function computeChartGeometry(points, vr, gapMs, overscan = 10) {
    const n = points.length;
    if (n === 0) return { solid: [], isolated: [], gaps: [] };
    let lo = 0;
    let hi = n - 1;
    while (lo < n && points[lo].t < vr.start) lo++;
    while (hi >= 0 && points[hi].t > vr.end) hi--;
    if (hi < lo) {
      hi = lo - 1;
    }
    const lo2 = Math.max(0, lo - overscan);
    const hi2 = Math.min(n - 1, hi + overscan);
    const t0 = points[lo2].t;
    const t1 = points[hi2].t;
    const solid = [];
    const isolated = [];
    const gaps = [];
    let run = [];
    const flush = () => {
      if (run.length === 1) isolated.push(run[0]);
      else if (run.length >= 2) solid.push(run);
      run = [];
    };
    for (let i = 0; i < n; i++) {
      const p = points[i];
      const gapBefore = i > 0 && p.t - points[i - 1].t > gapMs;
      if (gapBefore) {
        const a = points[i - 1];
        const b = p;
        if (b.t >= t0 && a.t <= t1) {
          gaps.push({
            from: a,
            to: b,
            prev: points[i - 2] ?? null,
            next: points[i + 1] ?? null
          });
        }
        flush();
      }
      if (p.t >= t0 && p.t <= t1) run.push(p);
      else flush();
    }
    flush();
    return { solid, isolated, gaps };
  }

  // node_modules/.pnpm/d3-shape@3.2.0/node_modules/d3-shape/src/constant.js
  function constant_default(x2) {
    return function constant() {
      return x2;
    };
  }

  // node_modules/.pnpm/d3-path@3.1.0/node_modules/d3-path/src/path.js
  var pi = Math.PI;
  var tau = 2 * pi;
  var epsilon = 1e-6;
  var tauEpsilon = tau - epsilon;
  function append(strings) {
    this._ += strings[0];
    for (let i = 1, n = strings.length; i < n; ++i) {
      this._ += arguments[i] + strings[i];
    }
  }
  function appendRound(digits) {
    let d = Math.floor(digits);
    if (!(d >= 0)) throw new Error(`invalid digits: ${digits}`);
    if (d > 15) return append;
    const k = 10 ** d;
    return function(strings) {
      this._ += strings[0];
      for (let i = 1, n = strings.length; i < n; ++i) {
        this._ += Math.round(arguments[i] * k) / k + strings[i];
      }
    };
  }
  var Path = class {
    constructor(digits) {
      this._x0 = this._y0 = // start of current subpath
      this._x1 = this._y1 = null;
      this._ = "";
      this._append = digits == null ? append : appendRound(digits);
    }
    moveTo(x2, y2) {
      this._append`M${this._x0 = this._x1 = +x2},${this._y0 = this._y1 = +y2}`;
    }
    closePath() {
      if (this._x1 !== null) {
        this._x1 = this._x0, this._y1 = this._y0;
        this._append`Z`;
      }
    }
    lineTo(x2, y2) {
      this._append`L${this._x1 = +x2},${this._y1 = +y2}`;
    }
    quadraticCurveTo(x1, y1, x2, y2) {
      this._append`Q${+x1},${+y1},${this._x1 = +x2},${this._y1 = +y2}`;
    }
    bezierCurveTo(x1, y1, x2, y2, x3, y3) {
      this._append`C${+x1},${+y1},${+x2},${+y2},${this._x1 = +x3},${this._y1 = +y3}`;
    }
    arcTo(x1, y1, x2, y2, r) {
      x1 = +x1, y1 = +y1, x2 = +x2, y2 = +y2, r = +r;
      if (r < 0) throw new Error(`negative radius: ${r}`);
      let x0 = this._x1, y0 = this._y1, x21 = x2 - x1, y21 = y2 - y1, x01 = x0 - x1, y01 = y0 - y1, l01_2 = x01 * x01 + y01 * y01;
      if (this._x1 === null) {
        this._append`M${this._x1 = x1},${this._y1 = y1}`;
      } else if (!(l01_2 > epsilon)) ;
      else if (!(Math.abs(y01 * x21 - y21 * x01) > epsilon) || !r) {
        this._append`L${this._x1 = x1},${this._y1 = y1}`;
      } else {
        let x20 = x2 - x0, y20 = y2 - y0, l21_2 = x21 * x21 + y21 * y21, l20_2 = x20 * x20 + y20 * y20, l21 = Math.sqrt(l21_2), l01 = Math.sqrt(l01_2), l = r * Math.tan((pi - Math.acos((l21_2 + l01_2 - l20_2) / (2 * l21 * l01))) / 2), t01 = l / l01, t21 = l / l21;
        if (Math.abs(t01 - 1) > epsilon) {
          this._append`L${x1 + t01 * x01},${y1 + t01 * y01}`;
        }
        this._append`A${r},${r},0,0,${+(y01 * x20 > x01 * y20)},${this._x1 = x1 + t21 * x21},${this._y1 = y1 + t21 * y21}`;
      }
    }
    arc(x2, y2, r, a0, a1, ccw) {
      x2 = +x2, y2 = +y2, r = +r, ccw = !!ccw;
      if (r < 0) throw new Error(`negative radius: ${r}`);
      let dx = r * Math.cos(a0), dy = r * Math.sin(a0), x0 = x2 + dx, y0 = y2 + dy, cw = 1 ^ ccw, da = ccw ? a0 - a1 : a1 - a0;
      if (this._x1 === null) {
        this._append`M${x0},${y0}`;
      } else if (Math.abs(this._x1 - x0) > epsilon || Math.abs(this._y1 - y0) > epsilon) {
        this._append`L${x0},${y0}`;
      }
      if (!r) return;
      if (da < 0) da = da % tau + tau;
      if (da > tauEpsilon) {
        this._append`A${r},${r},0,1,${cw},${x2 - dx},${y2 - dy}A${r},${r},0,1,${cw},${this._x1 = x0},${this._y1 = y0}`;
      } else if (da > epsilon) {
        this._append`A${r},${r},0,${+(da >= pi)},${cw},${this._x1 = x2 + r * Math.cos(a1)},${this._y1 = y2 + r * Math.sin(a1)}`;
      }
    }
    rect(x2, y2, w, h) {
      this._append`M${this._x0 = this._x1 = +x2},${this._y0 = this._y1 = +y2}h${w = +w}v${+h}h${-w}Z`;
    }
    toString() {
      return this._;
    }
  };
  function path() {
    return new Path();
  }
  path.prototype = Path.prototype;

  // node_modules/.pnpm/d3-shape@3.2.0/node_modules/d3-shape/src/path.js
  function withPath(shape) {
    let digits = 3;
    shape.digits = function(_) {
      if (!arguments.length) return digits;
      if (_ == null) {
        digits = null;
      } else {
        const d = Math.floor(_);
        if (!(d >= 0)) throw new RangeError(`invalid digits: ${_}`);
        digits = d;
      }
      return shape;
    };
    return () => new Path(digits);
  }

  // node_modules/.pnpm/d3-shape@3.2.0/node_modules/d3-shape/src/array.js
  var slice = Array.prototype.slice;
  function array_default(x2) {
    return typeof x2 === "object" && "length" in x2 ? x2 : Array.from(x2);
  }

  // node_modules/.pnpm/d3-shape@3.2.0/node_modules/d3-shape/src/curve/linear.js
  function Linear(context) {
    this._context = context;
  }
  Linear.prototype = {
    areaStart: function() {
      this._line = 0;
    },
    areaEnd: function() {
      this._line = NaN;
    },
    lineStart: function() {
      this._point = 0;
    },
    lineEnd: function() {
      if (this._line || this._line !== 0 && this._point === 1) this._context.closePath();
      this._line = 1 - this._line;
    },
    point: function(x2, y2) {
      x2 = +x2, y2 = +y2;
      switch (this._point) {
        case 0:
          this._point = 1;
          this._line ? this._context.lineTo(x2, y2) : this._context.moveTo(x2, y2);
          break;
        case 1:
          this._point = 2;
        // falls through
        default:
          this._context.lineTo(x2, y2);
          break;
      }
    }
  };
  function linear_default(context) {
    return new Linear(context);
  }

  // node_modules/.pnpm/d3-shape@3.2.0/node_modules/d3-shape/src/point.js
  function x(p) {
    return p[0];
  }
  function y(p) {
    return p[1];
  }

  // node_modules/.pnpm/d3-shape@3.2.0/node_modules/d3-shape/src/line.js
  function line_default(x2, y2) {
    var defined = constant_default(true), context = null, curve = linear_default, output = null, path2 = withPath(line);
    x2 = typeof x2 === "function" ? x2 : x2 === void 0 ? x : constant_default(x2);
    y2 = typeof y2 === "function" ? y2 : y2 === void 0 ? y : constant_default(y2);
    function line(data) {
      var i, n = (data = array_default(data)).length, d, defined0 = false, buffer;
      if (context == null) output = curve(buffer = path2());
      for (i = 0; i <= n; ++i) {
        if (!(i < n && defined(d = data[i], i, data)) === defined0) {
          if (defined0 = !defined0) output.lineStart();
          else output.lineEnd();
        }
        if (defined0) output.point(+x2(d, i, data), +y2(d, i, data));
      }
      if (buffer) return output = null, buffer + "" || null;
    }
    line.x = function(_) {
      return arguments.length ? (x2 = typeof _ === "function" ? _ : constant_default(+_), line) : x2;
    };
    line.y = function(_) {
      return arguments.length ? (y2 = typeof _ === "function" ? _ : constant_default(+_), line) : y2;
    };
    line.defined = function(_) {
      return arguments.length ? (defined = typeof _ === "function" ? _ : constant_default(!!_), line) : defined;
    };
    line.curve = function(_) {
      return arguments.length ? (curve = _, context != null && (output = curve(context)), line) : curve;
    };
    line.context = function(_) {
      return arguments.length ? (_ == null ? context = output = null : output = curve(context = _), line) : context;
    };
    return line;
  }

  // node_modules/.pnpm/d3-shape@3.2.0/node_modules/d3-shape/src/curve/monotone.js
  function sign(x2) {
    return x2 < 0 ? -1 : 1;
  }
  function slope3(that, x2, y2) {
    var h0 = that._x1 - that._x0, h1 = x2 - that._x1, s0 = (that._y1 - that._y0) / (h0 || h1 < 0 && -0), s1 = (y2 - that._y1) / (h1 || h0 < 0 && -0), p = (s0 * h1 + s1 * h0) / (h0 + h1);
    return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }
  function slope2(that, t) {
    var h = that._x1 - that._x0;
    return h ? (3 * (that._y1 - that._y0) / h - t) / 2 : t;
  }
  function point(that, t0, t1) {
    var x0 = that._x0, y0 = that._y0, x1 = that._x1, y1 = that._y1, dx = (x1 - x0) / 3;
    that._context.bezierCurveTo(x0 + dx, y0 + dx * t0, x1 - dx, y1 - dx * t1, x1, y1);
  }
  function MonotoneX(context) {
    this._context = context;
  }
  MonotoneX.prototype = {
    areaStart: function() {
      this._line = 0;
    },
    areaEnd: function() {
      this._line = NaN;
    },
    lineStart: function() {
      this._x0 = this._x1 = this._y0 = this._y1 = this._t0 = NaN;
      this._point = 0;
    },
    lineEnd: function() {
      switch (this._point) {
        case 2:
          this._context.lineTo(this._x1, this._y1);
          break;
        case 3:
          point(this, this._t0, slope2(this, this._t0));
          break;
      }
      if (this._line || this._line !== 0 && this._point === 1) this._context.closePath();
      this._line = 1 - this._line;
    },
    point: function(x2, y2) {
      var t1 = NaN;
      x2 = +x2, y2 = +y2;
      if (x2 === this._x1 && y2 === this._y1) return;
      switch (this._point) {
        case 0:
          this._point = 1;
          this._line ? this._context.lineTo(x2, y2) : this._context.moveTo(x2, y2);
          break;
        case 1:
          this._point = 2;
          break;
        case 2:
          this._point = 3;
          point(this, slope2(this, t1 = slope3(this, x2, y2)), t1);
          break;
        default:
          point(this, this._t0, t1 = slope3(this, x2, y2));
          break;
      }
      this._x0 = this._x1, this._x1 = x2;
      this._y0 = this._y1, this._y1 = y2;
      this._t0 = t1;
    }
  };
  function MonotoneY(context) {
    this._context = new ReflectContext(context);
  }
  (MonotoneY.prototype = Object.create(MonotoneX.prototype)).point = function(x2, y2) {
    MonotoneX.prototype.point.call(this, y2, x2);
  };
  function ReflectContext(context) {
    this._context = context;
  }
  ReflectContext.prototype = {
    moveTo: function(x2, y2) {
      this._context.moveTo(y2, x2);
    },
    closePath: function() {
      this._context.closePath();
    },
    lineTo: function(x2, y2) {
      this._context.lineTo(y2, x2);
    },
    bezierCurveTo: function(x1, y1, x2, y2, x3, y3) {
      this._context.bezierCurveTo(y1, x1, y2, x2, y3, x3);
    }
  };
  function monotoneX(context) {
    return new MonotoneX(context);
  }

  // webview/logic/paths.ts
  function straightPath(pts, xOf, yOf) {
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.t).toFixed(1)},${yOf(p.total).toFixed(1)}`).join(" ");
  }
  function smoothPath(pts, xOf, yOf) {
    const n = pts.length;
    if (n < 2) return "";
    const l = line_default().x((p) => Number(xOf(p.t).toFixed(1))).y((p) => Number(yOf(p.total).toFixed(1))).curve(monotoneX);
    return l(pts) ?? "";
  }
  function flattenSmoothSegment(p0, p1, p2, p3, xOf, yOf) {
    const h = p2.t - p1.t;
    if (h <= 0) return [[xOf(p1.t), yOf(p1.total)], [xOf(p2.t), yOf(p2.total)]];
    const s = (p2.total - p1.total) / h;
    if (s === 0) return [[xOf(p1.t), yOf(p1.total)], [xOf(p2.t), yOf(p2.total)]];
    let m1 = p1.t > p0.t ? (p1.total - p0.total) / (p1.t - p0.t) : s;
    let m2 = p3.t > p2.t ? (p3.total - p2.total) / (p3.t - p2.t) : s;
    if (m1 * s <= 0) m1 = 0;
    if (m2 * s <= 0) m2 = 0;
    const alpha = m1 / s;
    const beta = m2 / s;
    const a2b2 = alpha * alpha + beta * beta;
    if (a2b2 > 9) {
      const tau2 = 3 / Math.sqrt(a2b2);
      m1 = tau2 * alpha * s;
      m2 = tau2 * beta * s;
    }
    const bx0 = xOf(p1.t);
    const by0 = yOf(p1.total);
    const bx3 = xOf(p2.t);
    const by3 = yOf(p2.total);
    const c1x = bx0 + (bx3 - bx0) / 3;
    const c1y = yOf(p1.total + m1 * h / 3);
    const c2x = bx3 - (bx3 - bx0) / 3;
    const c2y = yOf(p2.total - m2 * h / 3);
    const STEPS = 64;
    const out = [[bx0, by0]];
    for (let i = 1; i < STEPS; i++) {
      const u = i / STEPS;
      const w = 1 - u;
      out.push([
        w * w * w * bx0 + 3 * w * w * u * c1x + 3 * w * u * u * c2x + u * u * u * bx3,
        w * w * w * by0 + 3 * w * w * u * c1y + 3 * w * u * u * c2y + u * u * u * by3
      ]);
    }
    out.push([bx3, by3]);
    return out;
  }
  function clipSegmentToRect(x0, y0, x1, y1, xmin, ymin, xmax, ymax) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    let t0 = 0;
    let t1 = 1;
    const p = [-dx, dx, -dy, dy];
    const q = [x0 - xmin, xmax - x0, y0 - ymin, ymax - y0];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return null;
      } else {
        const r = q[i] / p[i];
        if (p[i] < 0) {
          if (r > t1) return null;
          if (r > t0) t0 = r;
        } else {
          if (r < t0) return null;
          if (r < t1) t1 = r;
        }
      }
    }
    return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
  }
  function polylineToClippedPath(poly, xmin, ymin, xmax, ymax) {
    let d = "";
    let drawing = false;
    for (let i = 0; i < poly.length - 1; i++) {
      const [x0, y0] = poly[i];
      const [x1, y1] = poly[i + 1];
      const seg = clipSegmentToRect(x0, y0, x1, y1, xmin, ymin, xmax, ymax);
      if (!seg) {
        drawing = false;
        continue;
      }
      if (!drawing) {
        d += `M${seg[0].toFixed(1)},${seg[1].toFixed(1)}`;
        drawing = true;
      }
      d += `L${seg[2].toFixed(1)},${seg[3].toFixed(1)}`;
    }
    return d;
  }

  // webview/logic/axis.ts
  var M = { top: 16, right: 18, bottom: 30, left: 66 };
  var TIME_STEPS = [
    6e4,
    5 * 6e4,
    15 * 6e4,
    30 * 6e4,
    36e5,
    2 * 36e5,
    6 * 36e5,
    12 * 36e5,
    24 * 36e5,
    2 * 864e5,
    7 * 864e5,
    14 * 864e5,
    30 * 864e5,
    60 * 864e5,
    90 * 864e5,
    180 * 864e5,
    365 * 864e5
  ];
  function niceTicks(min, max, count) {
    const span = max - min;
    if (span <= 0) return [min];
    const step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
      out.push(Number(v.toFixed(10)));
    }
    return out;
  }
  function niceTimeStep(dur) {
    const target = dur / 8;
    for (const s of TIME_STEPS) {
      if (s >= target) return s;
    }
    return 365 * 864e5;
  }
  function fmtAxisTime(t, step, view) {
    if (view === "monthly" || step >= 30 * 864e5) return fmtMonth(t);
    if (view === "daily" || step >= 24 * 36e5) return fmtDayShort(t);
    return fmtClock(t);
  }
  function estimateTextWidth(text, fontSize = 11) {
    let w = 0;
    for (const ch of text) {
      w += ch.charCodeAt(0) > 255 ? fontSize : fontSize * 0.55;
    }
    return Math.max(28, w + 4);
  }
  function enforceMinSpan(yMin, yMax, ratio) {
    if (!(ratio > 0) || !isFinite(yMax) || yMax <= 0) return { yMin, yMax };
    const minSpan = yMax * ratio;
    if (yMax - yMin >= minSpan) return { yMin, yMax };
    const nyMin = Math.max(0, yMax - minSpan);
    if (yMax - nyMin >= minSpan) return { yMin: nyMin, yMax };
    return { yMin: nyMin, yMax: nyMin + minSpan };
  }

  // webview/components/Tooltip.tsx
  var _tmpl$6 = /* @__PURE__ */ template(`<div class=tooltip><div class=tt-time>`);
  var _tmpl$25 = /* @__PURE__ */ template(`<div class=tt-row><span></span><b>`);
  function computePos(info, el, wrap) {
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    if (tw <= 0 || th <= 0) return null;
    const ww = wrap ? wrap.clientWidth : 0;
    const wh = wrap ? wrap.clientHeight : 0;
    let tx = info.pointX + 14;
    if (tx + tw > ww - 8) tx = info.pointX - tw - 14;
    tx = Math.max(4, Math.min(tx, ww - tw - 4));
    let ty = info.pointY - th - 12;
    if (ty < 8) ty = info.pointY + 14;
    ty = Math.max(4, Math.min(ty, wh - th - 4));
    return {
      left: tx,
      top: ty
    };
  }
  function Tooltip() {
    let ref;
    const [pos, setPos] = createSignal(null);
    createRenderEffect(() => {
      const info = tooltipInfo();
      if (!info || !ref) {
        setPos(null);
        return;
      }
      const wrap = document.getElementById("chartWrap");
      const pos2 = computePos(info, ref, wrap);
      if (!pos2) {
        const info0 = info;
        const el = ref;
        setPos(null);
        requestAnimationFrame(() => {
          if (tooltipInfo() === info0 && el) {
            setPos(computePos(info0, el, document.getElementById("chartWrap")));
          }
        });
        return;
      }
      setPos(pos2);
    });
    return createComponent(Show, {
      get when() {
        return tooltipInfo();
      },
      get children() {
        var _el$ = _tmpl$6(), _el$2 = _el$.firstChild;
        var _ref$ = ref;
        typeof _ref$ === "function" ? use(_ref$, _el$) : ref = _el$;
        insert(_el$2, () => tooltipInfo().title);
        insert(_el$, createComponent(For, {
          get each() {
            return tooltipInfo().rows;
          },
          children: (r) => (() => {
            var _el$3 = _tmpl$25(), _el$4 = _el$3.firstChild, _el$5 = _el$4.nextSibling;
            insert(_el$4, () => r.label);
            insert(_el$5, () => r.value);
            return _el$3;
          })()
        }), null);
        createRenderEffect((_p$) => {
          var _v$ = `${pos()?.left ?? 0}px`, _v$2 = `${pos()?.top ?? 0}px`;
          _v$ !== _p$.e && setStyleProperty(_el$, "left", _p$.e = _v$);
          _v$2 !== _p$.t && setStyleProperty(_el$, "top", _p$.t = _v$2);
          return _p$;
        }, {
          e: void 0,
          t: void 0
        });
        return _el$;
      }
    });
  }

  // webview/components/Empty.tsx
  var _tmpl$7 = /* @__PURE__ */ template(`<button class="btn primary">\u8BBE\u7F6E API Key`);
  var _tmpl$26 = /* @__PURE__ */ template(`<div class=empty><div class=empty-icon><i class="codicon codicon-graph-line"></i></div><div class=empty-text>`);
  function Empty() {
    const info = createMemo(() => emptyInfo());
    return createComponent(Show, {
      get when() {
        return info();
      },
      get children() {
        var _el$ = _tmpl$26(), _el$2 = _el$.firstChild, _el$3 = _el$2.nextSibling;
        insert(_el$3, () => info().msg);
        insert(_el$, createComponent(Show, {
          get when() {
            return info().showAction;
          },
          get children() {
            var _el$4 = _tmpl$7();
            addEventListener(_el$4, "click", setApiKey, true);
            return _el$4;
          }
        }), null);
        return _el$;
      }
    });
  }
  delegateEvents(["click"]);

  // webview/components/ChartAxis.tsx
  var _tmpl$8 = /* @__PURE__ */ template(`<svg><g class=axis></svg>`, false, true, false);
  var _tmpl$27 = /* @__PURE__ */ template(`<svg><line class=grid></svg>`, false, true, false);
  var _tmpl$32 = /* @__PURE__ */ template(`<svg><text text-anchor=end dominant-baseline=middle></svg>`, false, true, false);
  var _tmpl$42 = /* @__PURE__ */ template(`<svg><text dominant-baseline=hanging></svg>`, false, true, false);
  function ChartAxis(props) {
    return [(() => {
      var _el$ = _tmpl$8();
      insert(_el$, createComponent(For, {
        get each() {
          return props.lay.yTicks;
        },
        children: (v) => {
          const y2 = props.lay.yOf(v);
          return (() => {
            var _el$3 = _tmpl$27();
            setAttribute(_el$3, "y1", y2);
            setAttribute(_el$3, "y2", y2);
            createRenderEffect((_p$) => {
              var _v$ = props.lay.plotLeft, _v$2 = props.lay.plotRight;
              _v$ !== _p$.e && setAttribute(_el$3, "x1", _p$.e = _v$);
              _v$2 !== _p$.t && setAttribute(_el$3, "x2", _p$.t = _v$2);
              return _p$;
            }, {
              e: void 0,
              t: void 0
            });
            return _el$3;
          })();
        }
      }), null);
      insert(_el$, createComponent(For, {
        get each() {
          return props.lay.yLabels;
        },
        children: (lbl) => (() => {
          var _el$4 = _tmpl$32();
          insert(_el$4, () => lbl.text);
          createRenderEffect((_p$) => {
            var _v$3 = props.lay.plotLeft - 8, _v$4 = lbl.y;
            _v$3 !== _p$.e && setAttribute(_el$4, "x", _p$.e = _v$3);
            _v$4 !== _p$.t && setAttribute(_el$4, "y", _p$.t = _v$4);
            return _p$;
          }, {
            e: void 0,
            t: void 0
          });
          return _el$4;
        })()
      }), null);
      return _el$;
    })(), (() => {
      var _el$2 = _tmpl$8();
      insert(_el$2, createComponent(For, {
        get each() {
          return props.lay.xTicks;
        },
        children: (t) => {
          const x2 = props.lay.xOf(t);
          return (() => {
            var _el$5 = _tmpl$27();
            setAttribute(_el$5, "x1", x2);
            setAttribute(_el$5, "x2", x2);
            createRenderEffect((_p$) => {
              var _v$5 = M.top, _v$6 = props.lay.h - M.bottom;
              _v$5 !== _p$.e && setAttribute(_el$5, "y1", _p$.e = _v$5);
              _v$6 !== _p$.t && setAttribute(_el$5, "y2", _p$.t = _v$6);
              return _p$;
            }, {
              e: void 0,
              t: void 0
            });
            return _el$5;
          })();
        }
      }), null);
      insert(_el$2, createComponent(For, {
        get each() {
          return props.lay.xLabels;
        },
        children: (lbl) => (() => {
          var _el$6 = _tmpl$42();
          insert(_el$6, () => lbl.text);
          createRenderEffect((_p$) => {
            var _v$7 = lbl.x, _v$8 = props.lay.h - M.bottom + 16, _v$9 = lbl.anchor;
            _v$7 !== _p$.e && setAttribute(_el$6, "x", _p$.e = _v$7);
            _v$8 !== _p$.t && setAttribute(_el$6, "y", _p$.t = _v$8);
            _v$9 !== _p$.a && setAttribute(_el$6, "text-anchor", _p$.a = _v$9);
            return _p$;
          }, {
            e: void 0,
            t: void 0,
            a: void 0
          });
          return _el$6;
        })()
      }), null);
      return _el$2;
    })()];
  }

  // webview/components/ChartSeries.tsx
  var _tmpl$9 = /* @__PURE__ */ template(`<svg><path></svg>`, false, true, false);
  var _tmpl$28 = /* @__PURE__ */ template(`<svg><path class=area></svg>`, false, true, false);
  var _tmpl$33 = /* @__PURE__ */ template(`<svg><path class=line></svg>`, false, true, false);
  var _tmpl$43 = /* @__PURE__ */ template(`<svg><circle class="line isolated"r=3></svg>`, false, true, false);
  function ChartSeries(props) {
    return [createComponent(For, {
      get each() {
        return props.connectorDraws;
      },
      children: (c) => [memo(() => memo(() => !!c.area)() ? (() => {
        var _el$2 = _tmpl$28();
        createRenderEffect((_p$) => {
          var _v$4 = c.area, _v$5 = c.color ? {
            fill: c.color
          } : void 0;
          _v$4 !== _p$.e && setAttribute(_el$2, "d", _p$.e = _v$4);
          _p$.t = style(_el$2, _v$5, _p$.t);
          return _p$;
        }, {
          e: void 0,
          t: void 0
        });
        return _el$2;
      })() : null), (() => {
        var _el$ = _tmpl$9();
        createRenderEffect((_p$) => {
          var _v$ = "connector" + (c.kind === "solid" || c.kind === "ignore" ? " solid" : c.kind === "dotted" ? " dotted" : ""), _v$2 = c.d, _v$3 = c.color ? {
            stroke: c.color
          } : void 0;
          _v$ !== _p$.e && setAttribute(_el$, "class", _p$.e = _v$);
          _v$2 !== _p$.t && setAttribute(_el$, "d", _p$.t = _v$2);
          _p$.a = style(_el$, _v$3, _p$.a);
          return _p$;
        }, {
          e: void 0,
          t: void 0,
          a: void 0
        });
        return _el$;
      })()]
    }), createComponent(For, {
      get each() {
        return props.solidDraws;
      },
      children: (s) => [(() => {
        var _el$3 = _tmpl$28();
        createRenderEffect(() => setAttribute(_el$3, "d", s.area));
        return _el$3;
      })(), (() => {
        var _el$4 = _tmpl$33();
        createRenderEffect(() => setAttribute(_el$4, "d", s.d));
        return _el$4;
      })()]
    }), createComponent(For, {
      get each() {
        return props.isolated;
      },
      children: (p) => (() => {
        var _el$5 = _tmpl$43();
        createRenderEffect((_p$) => {
          var _v$6 = props.lay.xOf(p.t), _v$7 = props.lay.yOf(p.total);
          _v$6 !== _p$.e && setAttribute(_el$5, "cx", _p$.e = _v$6);
          _v$7 !== _p$.t && setAttribute(_el$5, "cy", _p$.t = _v$7);
          return _p$;
        }, {
          e: void 0,
          t: void 0
        });
        return _el$5;
      })()
    })];
  }

  // webview/components/ChartCrosshair.tsx
  var _tmpl$10 = /* @__PURE__ */ template(`<svg><line class=crosshair></svg>`, false, true, false);
  var _tmpl$29 = /* @__PURE__ */ template(`<svg><circle class=hover-dot r=4></svg>`, false, true, false);
  function ChartCrosshair(props) {
    return createComponent(Show, {
      get when() {
        return props.hover;
      },
      get children() {
        return [(() => {
          var _el$ = _tmpl$10();
          createRenderEffect((_p$) => {
            var _v$ = props.hover.x, _v$2 = M.top, _v$3 = props.hover.x, _v$4 = props.h - M.bottom;
            _v$ !== _p$.e && setAttribute(_el$, "x1", _p$.e = _v$);
            _v$2 !== _p$.t && setAttribute(_el$, "y1", _p$.t = _v$2);
            _v$3 !== _p$.a && setAttribute(_el$, "x2", _p$.a = _v$3);
            _v$4 !== _p$.o && setAttribute(_el$, "y2", _p$.o = _v$4);
            return _p$;
          }, {
            e: void 0,
            t: void 0,
            a: void 0,
            o: void 0
          });
          return _el$;
        })(), (() => {
          var _el$2 = _tmpl$29();
          createRenderEffect((_p$) => {
            var _v$5 = props.hover.x, _v$6 = props.hover.y;
            _v$5 !== _p$.e && setAttribute(_el$2, "cx", _p$.e = _v$5);
            _v$6 !== _p$.t && setAttribute(_el$2, "cy", _p$.t = _v$6);
            return _p$;
          }, {
            e: void 0,
            t: void 0
          });
          return _el$2;
        })()];
      }
    });
  }

  // webview/hooks/useChartGestures.ts
  function useChartGestures(opts) {
    const [mouseX, setMouseX] = createSignal(-1);
    const [pinT, setPinT] = createSignal(null);
    const [pinUntil, setPinUntil] = createSignal(0);
    let zoomAnchorT = null;
    let zoomAnchorFrac = 0;
    let lastWheelTs = 0;
    let drag = null;
    onMount(() => {
      const container = opts.wrapRef();
      const svg = opts.svgRef();
      function onWheel(e) {
        e.preventDefault();
        if (!store.viewRange) return;
        const lay = opts.getLayout();
        if (!lay) return;
        const now = Date.now();
        const rect = svg.getBoundingClientRect();
        const innerW = rect.width - lay.plotLeft - M.right;
        if (innerW <= 0) return;
        const mx = e.clientX - rect.left;
        const vr = store.viewRange;
        const tCursor = vr.start + (mx - lay.plotLeft) / innerW * (vr.end - vr.start);
        if (now - lastWheelTs > 300) {
          const cd = opts.getChartData();
          let best = Infinity;
          let bt = tCursor;
          if (cd) {
            for (const seg of cd.geom.solid) {
              for (const p of seg) {
                const dx = Math.abs(p.t - tCursor);
                if (dx < best) {
                  best = dx;
                  bt = p.t;
                }
              }
            }
            for (const p of cd.geom.isolated) {
              const dx = Math.abs(p.t - tCursor);
              if (dx < best) {
                best = dx;
                bt = p.t;
              }
            }
          }
          const snapLimit = (vr.end - vr.start) * 0.15;
          zoomAnchorT = best <= snapLimit ? bt : tCursor;
          zoomAnchorFrac = (zoomAnchorT - vr.start) / (vr.end - vr.start);
        }
        lastWheelTs = now;
        setPinT(zoomAnchorT);
        setPinUntil(now + 350);
        const factor = Math.pow(1.15, -e.deltaY / 120);
        let dur = (vr.end - vr.start) * factor;
        dur = Math.min(store.maxWindow, Math.max(store.minWindow, dur));
        const bounds = computeDataBounds(store.data, store.view);
        const r = bounds ? clampRange(
          zoomAnchorT - zoomAnchorFrac * dur,
          zoomAnchorT + (1 - zoomAnchorFrac) * dur,
          bounds,
          store.minWindow
        ) : {
          start: zoomAnchorT - zoomAnchorFrac * dur,
          end: zoomAnchorT + (1 - zoomAnchorFrac) * dur
        };
        setViewRange(r, false);
      }
      function onPointerDown(e) {
        if (e.button !== 0 || !store.viewRange) return;
        drag = { startX: e.clientX, startRange: { ...store.viewRange } };
        setMouseX(-1);
        container.setPointerCapture(e.pointerId);
      }
      function onPointerMove(e) {
        if (!drag || !store.viewRange) return;
        const lay = opts.getLayout();
        if (!lay) return;
        const rect = svg.getBoundingClientRect();
        const innerW = rect.width - lay.plotLeft - M.right;
        const dur = drag.startRange.end - drag.startRange.start;
        const shift = (drag.startX - e.clientX) / innerW * dur;
        const bounds = computeDataBounds(store.data, store.view);
        const r = bounds ? clampRange(
          drag.startRange.start + shift,
          drag.startRange.end + shift,
          bounds,
          store.minWindow
        ) : { start: drag.startRange.start + shift, end: drag.startRange.end + shift };
        setViewRange(r, false);
      }
      function onPointerEnd() {
        drag = null;
      }
      function onMouseMove(e) {
        if (drag) return;
        const rect = svg.getBoundingClientRect();
        setMouseX(e.clientX - rect.left);
        setPinUntil(0);
      }
      function onMouseLeave() {
        setMouseX(-1);
      }
      function onDblClick() {
        resetView();
      }
      container.addEventListener("wheel", onWheel, { passive: false });
      container.addEventListener("pointerdown", onPointerDown);
      container.addEventListener("pointermove", onPointerMove);
      container.addEventListener("pointerup", onPointerEnd);
      container.addEventListener("pointercancel", onPointerEnd);
      container.addEventListener("mousemove", onMouseMove);
      container.addEventListener("mouseleave", onMouseLeave);
      container.addEventListener("dblclick", onDblClick);
      onCleanup(() => {
        container.removeEventListener("wheel", onWheel);
        container.removeEventListener("pointerdown", onPointerDown);
        container.removeEventListener("pointermove", onPointerMove);
        container.removeEventListener("pointerup", onPointerEnd);
        container.removeEventListener("pointercancel", onPointerEnd);
        container.removeEventListener("mousemove", onMouseMove);
        container.removeEventListener("mouseleave", onMouseLeave);
        container.removeEventListener("dblclick", onDblClick);
      });
    });
    return { mouseX, setMouseX, pinT, setPinT, pinUntil, setPinUntil };
  }

  // webview/components/Chart.tsx
  var _tmpl$11 = /* @__PURE__ */ template(`<svg><defs><clipPath id=plotClip><rect></svg>`, false, true, false);
  var _tmpl$210 = /* @__PURE__ */ template(`<svg><g clip-path=url(#plotClip)></svg>`, false, true, false);
  var _tmpl$34 = /* @__PURE__ */ template(`<main id=chartWrap><svg id=chart>`);
  function Chart() {
    let wrapRef;
    let svgRef;
    const [size, setSize] = createSignal({
      w: 0,
      h: 0
    });
    onMount(() => {
      const ro = new ResizeObserver(() => {
        if (wrapRef) setSize({
          w: wrapRef.clientWidth,
          h: wrapRef.clientHeight
        });
      });
      ro.observe(wrapRef);
      if (wrapRef) setSize({
        w: wrapRef.clientWidth,
        h: wrapRef.clientHeight
      });
      onCleanup(() => ro.disconnect());
    });
    const {
      mouseX,
      pinT,
      pinUntil
    } = useChartGestures({
      wrapRef: () => wrapRef,
      svgRef: () => svgRef,
      getLayout: () => layout(),
      getChartData: () => chartData()
    });
    const chartData = createMemo(() => {
      const data = store.data;
      const view = store.view;
      if (!data) return null;
      const all = viewPoints(data, view);
      if (!all.length) return null;
      const bounds = {
        minT: all[0].t,
        maxT: all[all.length - 1].t
      };
      const vr = store.viewRange ?? {
        start: bounds.minT,
        end: bounds.maxT
      };
      const decimated = decimate(all, 4e3);
      const gapMs = effectiveGapMs(decimated, view);
      return {
        view,
        vr,
        bounds,
        geom: computeChartGeometry(decimated, vr, gapMs)
      };
    });
    const layout = createMemo(() => {
      const cd = chartData();
      const {
        w,
        h
      } = size();
      if (!cd || w <= 0 || h <= 0) return null;
      const {
        vr,
        geom,
        view
      } = cd;
      const t0 = vr.start;
      const t1 = vr.end;
      const yPts = [];
      for (const seg of geom.solid) for (const p of seg) if (p.t >= vr.start && p.t <= vr.end) yPts.push(p);
      for (const p of geom.isolated) if (p.t >= vr.start && p.t <= vr.end) yPts.push(p);
      for (const g of geom.gaps) {
        if (g.to.t >= vr.start && g.from.t <= vr.end) {
          yPts.push(g.from);
          yPts.push(g.to);
        }
      }
      let yMin = Infinity;
      let yMax = -Infinity;
      for (const p of yPts) {
        if (p.total < yMin) yMin = p.total;
        if (p.total > yMax) yMax = p.total;
      }
      if (!isFinite(yMin)) {
        yMin = 0;
        yMax = 1;
      }
      const startAtZero = yMin <= yMax * 0.2;
      if (startAtZero) yMin = 0;
      let padY = (yMax - yMin) * 0.08 || Math.max(1, Math.abs(yMax) * 0.05);
      if (padY === 0) padY = 1;
      yMin = Math.max(0, yMin - padY);
      yMax += padY;
      const spanRatio = store.yMinSpanRatio ?? 0.2;
      ({
        yMin,
        yMax
      } = enforceMinSpan(yMin, yMax, spanRatio));
      const currency = yPts[0]?.currency || "CNY";
      const yTicks = niceTicks(yMin, yMax, 5);
      const yLabelW = yTicks.reduce((m, v) => Math.max(m, estimateTextWidth(fmtAxisMoney(v, currency))), 0);
      const plotLeft = Math.max(M.left, yLabelW + 14);
      const plotRight = w - M.right;
      const innerW = w - plotLeft - M.right;
      const innerH = h - M.top - M.bottom;
      if (innerW <= 0 || innerH <= 0) return null;
      const xOf = (t) => plotLeft + (t - t0) / (t1 - t0) * innerW;
      const yOf = (v) => M.top + innerH - (v - yMin) / (yMax - yMin) * innerH;
      const yLabels = [];
      {
        let lastY = Infinity;
        for (let i = 0; i < yTicks.length; i++) {
          const v = yTicks[i];
          const y2 = yOf(v);
          const isEdge = i === 0 || i === yTicks.length - 1;
          if (!isEdge && lastY - y2 < 16) continue;
          yLabels.push({
            v,
            y: y2,
            text: fmtAxisMoney(v, currency)
          });
          lastY = y2;
        }
      }
      const dur = t1 - t0;
      const xStep = niceTimeStep(dur);
      const xTicks = [];
      for (let t = Math.ceil(t0 / xStep) * xStep; t <= t1 + 1e-9; t += xStep) xTicks.push(t);
      const xLabels = [];
      {
        const all = xTicks.map((t) => {
          const x2 = xOf(t);
          const text = fmtAxisTime(t, xStep, view);
          return {
            t,
            x: x2,
            text,
            w: estimateTextWidth(text)
          };
        });
        if (all.length === 1) {
          xLabels.push({
            ...all[0],
            anchor: "middle"
          });
        } else if (all.length >= 2) {
          const firstL = {
            ...all[0],
            anchor: "start"
          };
          const lastL = {
            ...all[all.length - 1],
            anchor: "end"
          };
          xLabels.push(firstL);
          let prevRight = firstL.x + firstL.w;
          for (let i = 1; i < all.length - 1; i++) {
            const lbl = all[i];
            const l = lbl.x - lbl.w / 2;
            const r = lbl.x + lbl.w / 2;
            if (l < prevRight + 10) continue;
            if (r > plotRight - 4) continue;
            xLabels.push({
              ...lbl,
              anchor: "middle"
            });
            prevRight = r;
          }
          const lastLeft = lastL.x - lastL.w;
          while (xLabels.length > 1 && lastLeft < prevRight + 10) {
            xLabels.pop();
            const prev = xLabels[xLabels.length - 1];
            prevRight = prev.x + (prev.anchor === "start" ? prev.w : prev.w / 2);
          }
          xLabels.push(lastL);
        }
      }
      return {
        xOf,
        yOf,
        yMin,
        yMax,
        currency,
        w,
        h,
        xStep,
        xTicks,
        xLabels,
        yTicks,
        yLabels,
        plotLeft,
        plotRight
      };
    });
    const solidDraws = createMemo(() => {
      const cd = chartData();
      const lay = layout();
      if (!cd || !lay) return [];
      const smooth = (store.config?.lineStyle ?? "straight") === "smooth";
      const baseY = lay.yOf(lay.yMin);
      return cd.geom.solid.map((seg) => {
        const d = smooth ? smoothPath(seg, lay.xOf, lay.yOf) : straightPath(seg, lay.xOf, lay.yOf);
        return {
          d,
          area: `${d} L${lay.xOf(seg[seg.length - 1].t).toFixed(1)},${baseY.toFixed(1)} L${lay.xOf(seg[0].t).toFixed(1)},${baseY.toFixed(1)} Z`
        };
      });
    });
    const connectorDraws = createMemo(() => {
      const cd = chartData();
      const lay = layout();
      if (!cd || !lay) return [];
      const style2 = store.config?.connectorStyle ?? "dashed";
      if (style2 === "none") return [];
      const color = store.config?.connectorColor ?? "";
      const smooth = (store.config?.lineStyle ?? "straight") === "smooth";
      const {
        xOf,
        yOf
      } = lay;
      const plotX = lay.plotLeft;
      const plotY = M.top;
      const plotRight = lay.plotRight;
      const plotBottom = lay.h - M.bottom;
      const baseY = lay.yOf(lay.yMin);
      const out = [];
      for (const g of cd.geom.gaps) {
        let d;
        if (smooth) {
          d = polylineToClippedPath(flattenSmoothSegment(g.prev ?? g.from, g.from, g.to, g.next ?? g.to, xOf, yOf), plotX, plotY, plotRight, plotBottom);
        } else {
          const seg = clipSegmentToRect(xOf(g.from.t), yOf(g.from.total), xOf(g.to.t), yOf(g.to.total), plotX, plotY, plotRight, plotBottom);
          if (!seg) continue;
          d = `M${seg[0].toFixed(1)},${seg[1].toFixed(1)} L${seg[2].toFixed(1)},${seg[3].toFixed(1)}`;
        }
        if (!d) continue;
        const item = {
          d,
          kind: style2,
          color
        };
        if (style2 === "ignore") {
          item.area = `${d} L${xOf(g.to.t).toFixed(1)},${baseY.toFixed(1)} L${xOf(g.from.t).toFixed(1)},${baseY.toFixed(1)} Z`;
        }
        out.push(item);
      }
      return out;
    });
    const isolatedDraws = createMemo(() => {
      const cd = chartData();
      if (!cd) return [];
      if ((store.config?.connectorStyle ?? "dashed") !== "ignore") return cd.geom.isolated;
      const connected = /* @__PURE__ */ new Set();
      for (const g of cd.geom.gaps) {
        connected.add(g.from);
        connected.add(g.to);
      }
      return cd.geom.isolated.filter((p) => !connected.has(p));
    });
    const hover = createMemo(() => {
      const cd = chartData();
      const lay = layout();
      if (!cd || !lay) return null;
      const pts = [];
      const t0 = cd.vr.start;
      const t1 = cd.vr.end;
      for (const seg of cd.geom.solid) for (const p2 of seg) if (p2.t >= t0 && p2.t <= t1) pts.push(p2);
      for (const p2 of cd.geom.isolated) if (p2.t >= t0 && p2.t <= t1) pts.push(p2);
      if (!pts.length) return null;
      const {
        xOf,
        yOf
      } = lay;
      const pinned = pinT() !== null && Date.now() < pinUntil();
      let idx = -1;
      let best = Infinity;
      if (pinned) {
        const pt = pinT();
        for (let i = 0; i < pts.length; i++) {
          const dx = Math.abs(pts[i].t - pt);
          if (dx < best) {
            best = dx;
            idx = i;
          }
        }
      } else if (mouseX() >= 0) {
        for (let i = 0; i < pts.length; i++) {
          const dx = Math.abs(xOf(pts[i].t) - mouseX());
          if (dx < best) {
            best = dx;
            idx = i;
          }
        }
        if (best > 80) idx = -1;
      }
      if (idx < 0) return null;
      const p = pts[idx];
      return {
        x: xOf(p.t),
        y: yOf(p.total),
        p
      };
    });
    createEffect(() => {
      const h = hover();
      const lay = layout();
      if (!h || !lay) {
        setTooltipInfo(null);
        return;
      }
      const title = store.view === "monthly" ? fmtMonth(h.p.t) : store.view === "daily" ? fmtDay(h.p.t) : fmtDayShort(h.p.t) + " " + fmtClock(h.p.t);
      setTooltipInfo({
        pointX: h.x,
        pointY: h.y,
        title,
        rows: [{
          label: "\u603B\u4F59\u989D",
          value: fmtMoney(h.p.total, lay.currency)
        }, {
          label: "\u5145\u503C",
          value: fmtMoney(h.p.toppedUp, lay.currency)
        }, {
          label: "\u8D60\u9001",
          value: fmtMoney(h.p.granted, lay.currency)
        }]
      });
    });
    return (() => {
      var _el$ = _tmpl$34(), _el$2 = _el$.firstChild;
      var _ref$ = wrapRef;
      typeof _ref$ === "function" ? use(_ref$, _el$) : wrapRef = _el$;
      var _ref$2 = svgRef;
      typeof _ref$2 === "function" ? use(_ref$2, _el$2) : svgRef = _el$2;
      insert(_el$2, createComponent(Show, {
        get when() {
          return layout();
        },
        get children() {
          return [(() => {
            var _el$3 = _tmpl$11(), _el$4 = _el$3.firstChild, _el$5 = _el$4.firstChild;
            createRenderEffect((_p$) => {
              var _v$ = layout().plotLeft, _v$2 = M.top, _v$3 = layout().plotRight - layout().plotLeft, _v$4 = size().h - M.bottom - M.top;
              _v$ !== _p$.e && setAttribute(_el$5, "x", _p$.e = _v$);
              _v$2 !== _p$.t && setAttribute(_el$5, "y", _p$.t = _v$2);
              _v$3 !== _p$.a && setAttribute(_el$5, "width", _p$.a = _v$3);
              _v$4 !== _p$.o && setAttribute(_el$5, "height", _p$.o = _v$4);
              return _p$;
            }, {
              e: void 0,
              t: void 0,
              a: void 0,
              o: void 0
            });
            return _el$3;
          })(), createComponent(ChartAxis, {
            get lay() {
              return layout();
            },
            get view() {
              return store.view;
            }
          }), (() => {
            var _el$6 = _tmpl$210();
            insert(_el$6, createComponent(ChartSeries, {
              get lay() {
                return layout();
              },
              get isolated() {
                return isolatedDraws();
              },
              get solidDraws() {
                return solidDraws();
              },
              get connectorDraws() {
                return connectorDraws();
              }
            }));
            return _el$6;
          })(), createComponent(ChartCrosshair, {
            get hover() {
              return hover();
            },
            get h() {
              return size().h;
            }
          })];
        }
      }));
      insert(_el$, createComponent(Tooltip, {}), null);
      insert(_el$, createComponent(Empty, {}), null);
      createRenderEffect((_p$) => {
        var _v$5 = size().w, _v$6 = size().h;
        _v$5 !== _p$.e && setAttribute(_el$2, "width", _p$.e = _v$5);
        _v$6 !== _p$.t && setAttribute(_el$2, "height", _p$.t = _v$6);
        return _p$;
      }, {
        e: void 0,
        t: void 0
      });
      return _el$;
    })();
  }

  // webview/logic/consumption.ts
  var EPS2 = 1e-6;
  function bucketStart(t, g) {
    const d = new Date(t);
    if (g === "hour") {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime();
    }
    if (g === "day") {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }
  function aggregateConsumption(snapshots, g, windowMs, skipZero, now) {
    const acc = /* @__PURE__ */ new Map();
    const winStart = now - windowMs;
    let prev = null;
    for (const s of snapshots) {
      if (prev && s.total < prev.total - EPS2) {
        const b = bucketStart(s.t, g);
        if (b >= winStart) {
          acc.set(b, (acc.get(b) ?? 0) + (prev.total - s.total));
        }
      }
      prev = s;
    }
    const out = [];
    const start = bucketStart(winStart, g);
    const end = bucketStart(now, g);
    if (g === "month") {
      const d = new Date(start);
      for (let t = start; t <= end; ) {
        const v = acc.get(t) ?? 0;
        if (!skipZero || v > EPS2) out.push({ t, value: v });
        d.setMonth(d.getMonth() + 1);
        t = d.getTime();
      }
    } else {
      const step = g === "hour" ? 36e5 : 864e5;
      for (let t = start; t <= end; t += step) {
        const v = acc.get(t) ?? 0;
        if (!skipZero || v > EPS2) out.push({ t, value: v });
      }
    }
    return out;
  }

  // webview/components/ChartBars.tsx
  var _tmpl$12 = /* @__PURE__ */ template(`<svg><defs><clipPath id=plotClip><rect></svg>`, false, true, false);
  var _tmpl$211 = /* @__PURE__ */ template(`<svg><g clip-path=url(#plotClip)><g class=bars></svg>`, false, true, false);
  var _tmpl$35 = /* @__PURE__ */ template(`<div class=empty><div class=empty-text>\u8BE5\u65F6\u6BB5\u65E0\u6D88\u8D39`);
  var _tmpl$44 = /* @__PURE__ */ template(`<main id=chartWrap><svg id=chart>`);
  var _tmpl$52 = /* @__PURE__ */ template(`<svg><rect class=bar rx=2></svg>`, false, true, false);
  var SKIP_ZERO = {
    hour: true,
    day: false,
    month: false
  };
  function ChartBars() {
    let wrapRef;
    let svgRef;
    const [size, setSize] = createSignal({
      w: 0,
      h: 0
    });
    onMount(() => {
      const ro = new ResizeObserver(() => {
        if (wrapRef) setSize({
          w: wrapRef.clientWidth,
          h: wrapRef.clientHeight
        });
      });
      ro.observe(wrapRef);
      if (wrapRef) setSize({
        w: wrapRef.clientWidth,
        h: wrapRef.clientHeight
      });
      onCleanup(() => ro.disconnect());
    });
    const bars = createMemo(() => {
      const data = store.data;
      if (!data || !data.snapshots.length) return [];
      const g = store.consGran;
      const now = Date.now();
      let windowMs;
      if (g === "hour") {
        windowMs = 24 * 36e5;
      } else if (g === "day") {
        windowMs = now - (bucketStart(now, "day") - 6 * 864e5);
      } else {
        const t0 = new Date(bucketStart(now, "month"));
        t0.setMonth(t0.getMonth() - 11);
        windowMs = now - t0.getTime();
      }
      return aggregateConsumption(data.snapshots, g, windowMs, SKIP_ZERO[g], now);
    });
    const axisView = createMemo(() => store.consGran === "hour" ? "hourly" : store.consGran === "day" ? "daily" : "monthly");
    const layout = createMemo(() => {
      const bs = bars();
      const {
        w,
        h
      } = size();
      if (!bs.length || w <= 0 || h <= 0) return null;
      const g = store.consGran;
      const n = bs.length;
      const maxVal = bs.reduce((m, b) => Math.max(m, b.value), 0);
      const currency = store.data && store.data.current && store.data.current.currency || "CNY";
      let yTop = Math.max(maxVal, 0.01);
      let yTicks = niceTicks(0, yTop * 1.1, 5);
      while (yTicks.length > 1 && yTicks[yTicks.length - 1] < maxVal) {
        yTop *= 1.3;
        yTicks = niceTicks(0, yTop, 5);
      }
      const yMax = yTicks[yTicks.length - 1];
      const yMin = 0;
      const yLabelW = yTicks.reduce((m, v) => Math.max(m, estimateTextWidth(fmtAxisMoney(v, currency))), 0);
      const plotLeft = Math.max(M.left, yLabelW + 14);
      const plotRight = w - M.right;
      const innerW = w - plotLeft - M.right;
      const innerH = h - M.top - M.bottom;
      if (innerW <= 0 || innerH <= 0) return null;
      const slotW = innerW / n;
      const xOf = (t) => plotLeft + t * slotW;
      const yOf = (v) => M.top + innerH - (v - yMin) / (yMax - yMin) * innerH;
      const barW = Math.max(2, Math.min(slotW * 0.7, 48));
      const xTicks = [];
      for (let i = 0; i <= n; i++) xTicks.push(i);
      const crossesDay = startOfDay(bs[0].t) !== startOfDay(bs[n - 1].t);
      const labelText = (b) => g === "hour" ? (crossesDay ? fmtDayShort(b.t) + " " : "") + fmtClock(b.t) : g === "day" ? fmtDayShort(b.t) : fmtMonth(b.t);
      const labelW = g === "hour" ? crossesDay ? 82 : 42 : g === "day" ? 46 : 62;
      const every = Math.max(1, Math.ceil(n * labelW / Math.max(1, innerW)));
      const xLabels = [];
      for (let i = 0; i < n; i += every) {
        xLabels.push({
          t: bs[i].t,
          x: plotLeft + (i + 0.5) * slotW,
          text: labelText(bs[i]),
          w: labelW,
          anchor: "middle"
        });
      }
      if ((n - 1) % every !== 0) {
        const lastX = plotLeft + (n - 1 + 0.5) * slotW;
        const prev = xLabels[xLabels.length - 1];
        if (prev && lastX - prev.x >= labelW) {
          xLabels.push({
            t: bs[n - 1].t,
            x: lastX,
            text: labelText(bs[n - 1]),
            w: labelW,
            anchor: "middle"
          });
        }
      }
      const yLabels = [];
      {
        let lastY = Infinity;
        for (let i = 0; i < yTicks.length; i++) {
          const v = yTicks[i];
          const y2 = yOf(v);
          const isEdge = i === 0 || i === yTicks.length - 1;
          if (!isEdge && lastY - y2 < 16) continue;
          yLabels.push({
            v,
            y: y2,
            text: fmtAxisMoney(v, currency)
          });
          lastY = y2;
        }
      }
      return {
        xOf,
        yOf,
        yMin,
        yMax,
        currency,
        w,
        h,
        xStep: slotW,
        xTicks,
        xLabels,
        yTicks,
        yLabels,
        plotLeft,
        plotRight,
        barW
      };
    });
    const onMove = (e) => {
      const lay = layout();
      const bs = bars();
      if (!lay || !svgRef) return;
      const rect = svgRef.getBoundingClientRect();
      const x2 = e.clientX - rect.left;
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < bs.length; i++) {
        const d = Math.abs(lay.xOf(i + 0.5) - x2);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      const thr = Math.max(lay.barW / 2 + 8, 24);
      if (best < 0 || bestD > thr) {
        setTooltipInfo(null);
        return;
      }
      const b = bs[best];
      const title = store.consGran === "hour" ? fmtDayShort(b.t) + " " + fmtClock(b.t) : store.consGran === "day" ? fmtDay(b.t) : fmtMonth(b.t);
      setTooltipInfo({
        pointX: lay.xOf(best + 0.5),
        pointY: lay.yOf(b.value),
        title,
        rows: [{
          label: "\u6D88\u8D39",
          value: fmtMoney(b.value, lay.currency)
        }]
      });
    };
    const hasData = () => !!(store.data && store.data.snapshots.length);
    const noConsumption = () => bars().length === 0 || bars().every((b) => b.value <= EPS2);
    return (() => {
      var _el$ = _tmpl$44(), _el$2 = _el$.firstChild;
      var _ref$ = wrapRef;
      typeof _ref$ === "function" ? use(_ref$, _el$) : wrapRef = _el$;
      _el$2.addEventListener("mouseleave", () => setTooltipInfo(null));
      _el$2.$$mousemove = onMove;
      var _ref$2 = svgRef;
      typeof _ref$2 === "function" ? use(_ref$2, _el$2) : svgRef = _el$2;
      insert(_el$2, createComponent(Show, {
        get when() {
          return layout();
        },
        get children() {
          return [(() => {
            var _el$3 = _tmpl$12(), _el$4 = _el$3.firstChild, _el$5 = _el$4.firstChild;
            createRenderEffect((_p$) => {
              var _v$ = layout().plotLeft, _v$2 = M.top, _v$3 = layout().plotRight - layout().plotLeft, _v$4 = size().h - M.bottom - M.top;
              _v$ !== _p$.e && setAttribute(_el$5, "x", _p$.e = _v$);
              _v$2 !== _p$.t && setAttribute(_el$5, "y", _p$.t = _v$2);
              _v$3 !== _p$.a && setAttribute(_el$5, "width", _p$.a = _v$3);
              _v$4 !== _p$.o && setAttribute(_el$5, "height", _p$.o = _v$4);
              return _p$;
            }, {
              e: void 0,
              t: void 0,
              a: void 0,
              o: void 0
            });
            return _el$3;
          })(), createComponent(ChartAxis, {
            get lay() {
              return layout();
            },
            get view() {
              return axisView();
            }
          }), (() => {
            var _el$6 = _tmpl$211(), _el$7 = _el$6.firstChild;
            insert(_el$7, createComponent(For, {
              get each() {
                return bars();
              },
              children: (b, i) => {
                const lay = layout();
                const x2 = Math.max(lay.plotLeft, Math.min(lay.plotRight - lay.barW, lay.xOf(i() + 0.5) - lay.barW / 2));
                const top = lay.yOf(b.value);
                const bottom = lay.yOf(lay.yMin);
                return (() => {
                  var _el$9 = _tmpl$52();
                  setAttribute(_el$9, "x", x2);
                  setAttribute(_el$9, "y", top);
                  createRenderEffect((_p$) => {
                    var _v$7 = lay.barW, _v$8 = Math.max(0, bottom - top);
                    _v$7 !== _p$.e && setAttribute(_el$9, "width", _p$.e = _v$7);
                    _v$8 !== _p$.t && setAttribute(_el$9, "height", _p$.t = _v$8);
                    return _p$;
                  }, {
                    e: void 0,
                    t: void 0
                  });
                  return _el$9;
                })();
              }
            }));
            return _el$6;
          })()];
        }
      }));
      insert(_el$, createComponent(Tooltip, {}), null);
      insert(_el$, createComponent(Show, {
        get when() {
          return memo(() => !!hasData())() && noConsumption();
        },
        get children() {
          return _tmpl$35();
        }
      }), null);
      insert(_el$, createComponent(Show, {
        get when() {
          return !hasData();
        },
        get children() {
          return createComponent(Empty, {});
        }
      }), null);
      createRenderEffect((_p$) => {
        var _v$5 = size().w, _v$6 = size().h;
        _v$5 !== _p$.e && setAttribute(_el$2, "width", _p$.e = _v$5);
        _v$6 !== _p$.t && setAttribute(_el$2, "height", _p$.t = _v$6);
        return _p$;
      }, {
        e: void 0,
        t: void 0
      });
      return _el$;
    })();
  }
  delegateEvents(["mousemove"]);

  // webview/components/Collapse.tsx
  var _tmpl$13 = /* @__PURE__ */ template(`<div><div class=collapse-inner>`);
  function Collapse(props) {
    return (() => {
      var _el$ = _tmpl$13(), _el$2 = _el$.firstChild;
      insert(_el$2, () => props.children);
      createRenderEffect(() => className(_el$, "collapse" + (props.open ? " open" : "")));
      return _el$;
    })();
  }

  // webview/components/SettingsGroup.tsx
  var _tmpl$14 = /* @__PURE__ */ template(`<div class=settings-group><button type=button><span class=settings-group-title><i></i></span><i class="codicon codicon-chevron-down">`);
  function SettingsGroup(props) {
    return (() => {
      var _el$ = _tmpl$14(), _el$2 = _el$.firstChild, _el$3 = _el$2.firstChild, _el$4 = _el$3.firstChild;
      addEventListener(_el$2, "click", props.onToggle, true);
      insert(_el$3, () => props.title, null);
      insert(_el$, createComponent(Collapse, {
        get open() {
          return props.open;
        },
        get children() {
          return props.children;
        }
      }), null);
      createRenderEffect((_p$) => {
        var _v$ = "settings-group-head" + (props.open ? " open" : ""), _v$2 = `codicon codicon-${props.icon}`;
        _v$ !== _p$.e && className(_el$2, _p$.e = _v$);
        _v$2 !== _p$.t && className(_el$4, _p$.t = _v$2);
        return _p$;
      }, {
        e: void 0,
        t: void 0
      });
      return _el$;
    })();
  }
  delegateEvents(["click"]);

  // webview/components/SettingRow.tsx
  var _tmpl$15 = /* @__PURE__ */ template(`<div class=settings-row><div class=settings-label-wrap></div><div class=settings-controls>`);
  var _tmpl$212 = /* @__PURE__ */ template(`<label class=settings-label-text>`);
  var _tmpl$36 = /* @__PURE__ */ template(`<span class=settings-label-text>`);
  var _tmpl$45 = /* @__PURE__ */ template(`<span class=settings-hint-inline>`);
  function SettingRow(props) {
    return (() => {
      var _el$ = _tmpl$15(), _el$2 = _el$.firstChild, _el$3 = _el$2.nextSibling;
      insert(_el$2, (() => {
        var _c$ = memo(() => !!props.for);
        return () => _c$() ? (() => {
          var _el$4 = _tmpl$212();
          insert(_el$4, () => props.label);
          createRenderEffect(() => setAttribute(_el$4, "for", props.for));
          return _el$4;
        })() : (() => {
          var _el$5 = _tmpl$36();
          insert(_el$5, () => props.label);
          return _el$5;
        })();
      })(), null);
      insert(_el$2, (() => {
        var _c$2 = memo(() => !!props.hint);
        return () => _c$2() ? (() => {
          var _el$6 = _tmpl$45();
          insert(_el$6, () => props.hint);
          return _el$6;
        })() : null;
      })(), null);
      insert(_el$3, () => props.children);
      return _el$;
    })();
  }

  // webview/components/ThresholdEditor.tsx
  var _tmpl$16 = /* @__PURE__ */ template(`<div class=threshold-head><span>\u4F59\u989D\u9608\u503C\uFF08\u4F4E\u4E8E \u2192 \u989C\u8272\uFF09</span><button class="btn small"><i class="codicon codicon-add"></i>\u6DFB\u52A0`);
  var _tmpl$213 = /* @__PURE__ */ template(`<div id=thresholdList>`);
  var _tmpl$37 = /* @__PURE__ */ template(`<p class=settings-hint>\u4F59\u989D\u4F4E\u4E8E\u9608\u503C\uFF08\u4E0D\u542B\uFF09\u65F6\u663E\u793A\u5BF9\u5E94\u989C\u8272\u3002`);
  var _tmpl$46 = /* @__PURE__ */ template(`<div class=threshold-row><input type=number class=threshold-below min=0 step=0.01><span class=sep>\u4EE5\u4E0B</span><input type=color class=threshold-color><button class="icon threshold-del"title=\u5220\u9664\u8BE5\u9608\u503C><i class="codicon codicon-trash">`);
  function ThresholdEditor(props) {
    function add() {
      props.onChange([...props.thresholds, {
        below: 100,
        color: "#ffb900"
      }]);
    }
    function setBelow(i, v) {
      props.onChange(props.thresholds.map((t, idx) => idx === i ? {
        ...t,
        below: v
      } : t));
    }
    function setColor(i, c) {
      props.onChange(props.thresholds.map((t, idx) => idx === i ? {
        ...t,
        color: c
      } : t));
    }
    function remove(i) {
      props.onChange(props.thresholds.filter((_, idx) => idx !== i));
    }
    return [(() => {
      var _el$ = _tmpl$16(), _el$2 = _el$.firstChild, _el$3 = _el$2.nextSibling;
      _el$3.$$click = add;
      return _el$;
    })(), (() => {
      var _el$4 = _tmpl$213();
      insert(_el$4, createComponent(For, {
        get each() {
          return props.thresholds;
        },
        children: (t, i) => (() => {
          var _el$6 = _tmpl$46(), _el$7 = _el$6.firstChild, _el$8 = _el$7.nextSibling, _el$9 = _el$8.nextSibling, _el$0 = _el$9.nextSibling;
          _el$7.$$input = (e) => {
            const v = parseFloat(e.currentTarget.value);
            if (Number.isFinite(v)) setBelow(i(), v);
          };
          _el$9.addEventListener("change", (e) => setColor(i(), e.currentTarget.value));
          _el$0.$$click = () => remove(i());
          createRenderEffect(() => _el$7.value = t.below);
          createRenderEffect(() => _el$9.value = t.color);
          return _el$6;
        })()
      }));
      return _el$4;
    })(), _tmpl$37()];
  }
  delegateEvents(["click", "input"]);

  // webview/components/settings/StatusBarGroup.tsx
  var _tmpl$17 = /* @__PURE__ */ template(`<input id=statusBarShowEl type=checkbox>`);
  var _tmpl$214 = /* @__PURE__ */ template(`<button type=button><span>\u9608\u503C\u989C\u8272</span><i class="codicon codicon-chevron-down">`);
  var _tmpl$38 = /* @__PURE__ */ template(`<input type=color>`);
  var _tmpl$47 = /* @__PURE__ */ template(`<label class=settings-inline><input type=checkbox>\u8DDF\u968F\u4E3B\u9898`);
  function StatusBarGroup(props) {
    const [colorOpen, setColorOpen] = createSignal(false);
    return [createComponent(SettingRow, {
      label: "\u663E\u793A\u4F59\u989D",
      "for": "statusBarShowEl",
      get children() {
        var _el$ = _tmpl$17();
        _el$.addEventListener("change", (e) => props.setStaged("statusBarShow", e.currentTarget.checked));
        createRenderEffect(() => _el$.checked = props.staged?.statusBarShow);
        return _el$;
      }
    }), (() => {
      var _el$2 = _tmpl$214();
      _el$2.$$click = () => setColorOpen((o) => !o);
      createRenderEffect(() => className(_el$2, "settings-toggle" + (colorOpen() ? " open" : "")));
      return _el$2;
    })(), createComponent(Collapse, {
      get open() {
        return colorOpen();
      },
      get children() {
        return [createComponent(SettingRow, {
          label: "\u9ED8\u8BA4\u989C\u8272",
          get children() {
            return [(() => {
              var _el$3 = _tmpl$38();
              _el$3.addEventListener("change", (e) => props.setStaged("defaultColor", e.currentTarget.value));
              createRenderEffect(() => _el$3.disabled = !props.staged?.defaultColor);
              createRenderEffect(() => _el$3.value = props.staged?.defaultColor || "#000000");
              return _el$3;
            })(), (() => {
              var _el$4 = _tmpl$47(), _el$5 = _el$4.firstChild;
              _el$5.addEventListener("change", (e) => {
                const theme = e.currentTarget.checked;
                props.setStaged("defaultColor", theme ? "" : "#000000");
              });
              createRenderEffect(() => _el$5.checked = !props.staged?.defaultColor);
              return _el$4;
            })()];
          }
        }), createComponent(ThresholdEditor, {
          get thresholds() {
            return props.staged?.thresholds ?? [];
          },
          onChange: (next) => props.setStaged("thresholds", next)
        })];
      }
    })];
  }
  delegateEvents(["click"]);

  // webview/components/settings/ChartGroup.tsx
  var _tmpl$18 = /* @__PURE__ */ template(`<select id=lineStyleEl class=settings-select><option value=straight>\u76F4\u7EBF</option><option value=smooth>\u66F2\u7EBF`);
  var _tmpl$215 = /* @__PURE__ */ template(`<select id=connectorStyleEl class=settings-select><option value=dashed>\u865A\u7EBF</option><option value=dotted>\u70B9\u865A\u7EBF</option><option value=solid>\u5B9E\u7EBF</option><option value=ignore>\u5047\u88C5\u8FDE\u7EED</option><option value=none>\u4E0D\u8FDE\u63A5`);
  var _tmpl$39 = /* @__PURE__ */ template(`<input type=color>`);
  var _tmpl$48 = /* @__PURE__ */ template(`<label class=settings-inline><input type=checkbox>\u8DDF\u968F\u4E3B\u8272`);
  var _tmpl$53 = /* @__PURE__ */ template(`<input type=number id=yMinSpanRatioEl min=0 max=1 step=0.05 class=settings-number>`);
  function ChartGroup(props) {
    return [createComponent(SettingRow, {
      label: "\u7EBF\u6761\u6837\u5F0F",
      "for": "lineStyleEl",
      get children() {
        var _el$ = _tmpl$18();
        _el$.addEventListener("change", (e) => props.setStaged("lineStyle", e.currentTarget.value));
        createRenderEffect(() => _el$.value = props.staged?.lineStyle ?? "straight");
        return _el$;
      }
    }), createComponent(SettingRow, {
      label: "\u65AD\u70B9\u8FDE\u63A5\u7EBF",
      "for": "connectorStyleEl",
      hint: "\u8F6E\u8BE2\u65AD\u6863\u65F6\u7528\u8FDE\u63A5\u7EBF\u8865\u9F50\u7F3A\u53E3",
      get children() {
        var _el$2 = _tmpl$215();
        _el$2.addEventListener("change", (e) => props.setStaged("connectorStyle", e.currentTarget.value));
        createRenderEffect(() => _el$2.value = props.staged?.connectorStyle ?? "dashed");
        return _el$2;
      }
    }), createComponent(SettingRow, {
      label: "\u8FDE\u63A5\u7EBF\u989C\u8272",
      get children() {
        return [(() => {
          var _el$3 = _tmpl$39();
          _el$3.addEventListener("change", (e) => props.setStaged("connectorColor", e.currentTarget.value));
          createRenderEffect(() => _el$3.disabled = !props.staged?.connectorColor);
          createRenderEffect(() => _el$3.value = props.staged?.connectorColor || "#000000");
          return _el$3;
        })(), (() => {
          var _el$4 = _tmpl$48(), _el$5 = _el$4.firstChild;
          _el$5.addEventListener("change", (e) => {
            const theme = e.currentTarget.checked;
            props.setStaged("connectorColor", theme ? "" : "#000000");
          });
          createRenderEffect(() => _el$5.checked = !props.staged?.connectorColor);
          return _el$4;
        })()];
      }
    }), createComponent(SettingRow, {
      label: "\u7EB5\u5411\u6700\u5C0F\u8DE8\u5EA6",
      "for": "yMinSpanRatioEl",
      hint: "\u9650\u5236\u66F2\u7EBF\u7EB5\u5411\u653E\u5927\uFF1B0 \u4E3A\u5B8C\u5168\u81EA\u9002\u5E94",
      get children() {
        var _el$6 = _tmpl$53();
        _el$6.addEventListener("change", (e) => {
          const v = Number(e.currentTarget.value);
          if (Number.isFinite(v)) props.setYRatio(Math.min(1, Math.max(0, v)));
        });
        createRenderEffect(() => _el$6.value = props.yRatio);
        return _el$6;
      }
    })];
  }

  // webview/components/settings/GeneralGroup.tsx
  var _tmpl$19 = /* @__PURE__ */ template(`<input type=number id=pollMinutesEl min=1 step=1 class=settings-number>`);
  var _tmpl$216 = /* @__PURE__ */ template(`<input type=number id=rawRetentionEl min=1 step=1 class=settings-number>`);
  var _tmpl$310 = /* @__PURE__ */ template(`<input id=showTodaySpendEl type=checkbox>`);
  var _tmpl$49 = /* @__PURE__ */ template(`<div class=settings-consent><p class=settings-hint>\u4ECA\u65E5\u82B1\u8D39\u4E3A\u6839\u636E\u4F59\u989D\u5FEB\u7167\u63A8\u7B97\u7684\u4F30\u7B97\u503C\uFF0C\u53EF\u80FD\u56E0\u5145\u503C\u6216\u6570\u636E\u65AD\u6863\u800C\u4E0D\u51C6\u786E\u3002</p><div class=row><button class="btn primary">\u540C\u610F\u542F\u7528</button><button class=btn>\u53D6\u6D88`);
  var _tmpl$54 = /* @__PURE__ */ template(`<select id=dayBoundaryEl class=settings-select><option value=local>\u672C\u5730\u65F6\u533A</option><option value=utc>UTC\uFF08\u4E0E\u5B98\u65B9\u4E00\u81F4\uFF09`);
  function GeneralGroup(props) {
    const [consent, setConsent] = createSignal(false);
    return [createComponent(SettingRow, {
      label: "\u67E5\u8BE2\u95F4\u9694\uFF08\u5206\u949F\uFF09",
      "for": "pollMinutesEl",
      get children() {
        var _el$ = _tmpl$19();
        _el$.addEventListener("change", (e) => {
          const v = parseInt(e.currentTarget.value, 10);
          if (Number.isFinite(v) && v >= 1) props.setStaged("pollMinutes", v);
        });
        createRenderEffect(() => _el$.value = props.staged?.pollMinutes);
        return _el$;
      }
    }), createComponent(SettingRow, {
      label: "\u5206\u949F\u7EA7\u5FEB\u7167\u4FDD\u7559\uFF08\u5929\uFF09",
      "for": "rawRetentionEl",
      get children() {
        var _el$2 = _tmpl$216();
        _el$2.addEventListener("change", (e) => {
          const v = parseInt(e.currentTarget.value, 10);
          if (Number.isFinite(v) && v >= 1) props.setStaged("rawRetentionDays", v);
        });
        createRenderEffect(() => _el$2.value = props.staged?.rawRetentionDays);
        return _el$2;
      }
    }), createComponent(SettingRow, {
      label: "\u663E\u793A\u4ECA\u65E5\u82B1\u8D39\uFF08\u4F30\u7B97\uFF09",
      "for": "showTodaySpendEl",
      get children() {
        var _el$3 = _tmpl$310();
        _el$3.addEventListener("change", (e) => {
          if (e.currentTarget.checked) {
            setConsent(true);
          } else {
            props.setStaged("showTodaySpend", false);
            setConsent(false);
          }
        });
        createRenderEffect(() => _el$3.checked = props.staged?.showTodaySpend || consent());
        return _el$3;
      }
    }), createComponent(Show, {
      get when() {
        return consent();
      },
      get children() {
        var _el$4 = _tmpl$49(), _el$5 = _el$4.firstChild, _el$6 = _el$5.nextSibling, _el$7 = _el$6.firstChild, _el$8 = _el$7.nextSibling;
        _el$7.$$click = () => {
          props.setStaged("showTodaySpend", true);
          setConsent(false);
        };
        _el$8.$$click = () => {
          props.setStaged("showTodaySpend", false);
          setConsent(false);
        };
        return _el$4;
      }
    }), createComponent(SettingRow, {
      label: "\u4ECA\u65E5\u82B1\u8D39\u65E5\u754C",
      "for": "dayBoundaryEl",
      hint: "DeepSeek \u5B98\u65B9\u6309 UTC \u8BA1\u7B97\u6BCF\u65E5\u7528\u91CF",
      get children() {
        var _el$9 = _tmpl$54();
        _el$9.addEventListener("change", (e) => props.setStaged("dayBoundary", e.currentTarget.value));
        createRenderEffect(() => _el$9.value = props.staged?.dayBoundary ?? "local");
        return _el$9;
      }
    })];
  }
  delegateEvents(["click"]);

  // webview/components/settings/ApiKeyGroup.tsx
  var _tmpl$20 = /* @__PURE__ */ template(`<button class=btn>\u8BBE\u7F6E / \u66F4\u6362`);
  var _tmpl$217 = /* @__PURE__ */ template(`<button class="btn danger">\u6E05\u9664`);
  function ApiKeyGroup() {
    return createComponent(SettingRow, {
      get label() {
        return store.data && store.data.hasKey ? "\u5DF2\u914D\u7F6E\uFF08\u5B89\u5168\u5B58\u50A8\uFF09" : "\u672A\u914D\u7F6E";
      },
      get children() {
        return [(() => {
          var _el$ = _tmpl$20();
          _el$.$$click = () => postMessage({
            type: "setApiKey"
          });
          return _el$;
        })(), (() => {
          var _el$2 = _tmpl$217();
          _el$2.$$click = () => postMessage({
            type: "clearApiKey"
          });
          return _el$2;
        })()];
      }
    });
  }
  delegateEvents(["click"]);

  // webview/components/settings/DataGroup.tsx
  var _tmpl$21 = /* @__PURE__ */ template(`<button class="btn danger">\u6E05\u9664\u5386\u53F2`);
  function DataGroup() {
    return createComponent(SettingRow, {
      label: "\u5386\u53F2\u5FEB\u7167\uFF08\u4EC5 VS Code \u6253\u5F00\u671F\u95F4\u8BB0\u5F55\uFF09",
      get children() {
        var _el$ = _tmpl$21();
        _el$.$$click = () => postMessage({
          type: "clearHistory"
        });
        return _el$;
      }
    });
  }
  delegateEvents(["click"]);

  // webview/components/settings/MiscGroup.tsx
  var _tmpl$30 = /* @__PURE__ */ template(`<button class="btn danger">\u6062\u590D\u9ED8\u8BA4`);
  function MiscGroup() {
    return createComponent(SettingRow, {
      label: "\u6062\u590D\u9ED8\u8BA4\u8BBE\u7F6E",
      get children() {
        var _el$ = _tmpl$30();
        _el$.$$click = () => postMessage({
          type: "resetSettings"
        });
        return _el$;
      }
    });
  }
  delegateEvents(["click"]);

  // webview/components/Settings.tsx
  var _tmpl$31 = /* @__PURE__ */ template(`<div class=overlay><div class=settings-panel><div class=settings-head><span class=settings-title>DeepSeek Stats \u8BBE\u7F6E</span><button class=icon title=\u5173\u95ED><i class="codicon codicon-close"></i></button></div><div class=settings-body></div><div class=settings-foot><button class=btn><i class="codicon codicon-settings-gear"></i>\u6253\u5F00 VS Code \u8BBE\u7F6E</button><button class=btn>\u53D6\u6D88</button><button class="btn primary"><i class="codicon codicon-check"></i>\u4FDD\u5B58`);
  function Settings(props) {
    const [groupsOpen, setGroupsOpen] = createStore({
      statusBar: true,
      chart: true,
      general: true,
      apiKey: false,
      data: false,
      misc: false
    });
    const [staged, setStaged] = createStore(stagedFromConfig(store.config));
    const [yRatio, setYRatio] = createSignal(store.yMinSpanRatio ?? 0.2);
    createEffect(() => setSpendPreview(staged.showTodaySpend));
    onCleanup(() => setSpendPreview(null));
    createEffect(on(() => store.config, () => {
      if (store.settingsOpen) setStaged(stagedFromConfig(store.config));
    }));
    function close() {
      setSpendPreview(null);
      props.onClose();
    }
    function save() {
      const payload = {
        statusBarShow: staged.statusBarShow,
        defaultColor: staged.defaultColor,
        // staged 来自 createStore，元素是 proxy；map 成 plain object 再发送
        thresholds: staged.thresholds.filter((t) => Number.isFinite(t.below)).map((t) => ({
          below: t.below,
          color: t.color
        })).sort((a, b) => a.below - b.below),
        pollMinutes: staged.pollMinutes,
        rawRetentionDays: staged.rawRetentionDays,
        showTodaySpend: staged.showTodaySpend,
        connectorStyle: staged.connectorStyle,
        connectorColor: staged.connectorColor,
        lineStyle: staged.lineStyle,
        dayBoundary: staged.dayBoundary
      };
      applySavedConfig(payload);
      postMessage({
        type: "saveSettings",
        payload
      });
      const ratio = Math.min(1, Math.max(0, yRatio()));
      setYMinSpanRatio(ratio);
      postMessage({
        type: "setYMinSpanRatio",
        payload: {
          ratio
        }
      });
      close();
    }
    return (() => {
      var _el$ = _tmpl$31(), _el$2 = _el$.firstChild, _el$3 = _el$2.firstChild, _el$4 = _el$3.firstChild, _el$5 = _el$4.nextSibling, _el$6 = _el$3.nextSibling, _el$7 = _el$6.nextSibling, _el$8 = _el$7.firstChild, _el$9 = _el$8.nextSibling, _el$0 = _el$9.nextSibling;
      _el$.$$pointerdown = (e) => {
        if (e.target === e.currentTarget) close();
      };
      _el$5.$$click = close;
      insert(_el$6, createComponent(SettingsGroup, {
        title: "\u72B6\u6001\u680F",
        icon: "account",
        get open() {
          return groupsOpen.statusBar;
        },
        onToggle: () => setGroupsOpen("statusBar", (o) => !o),
        get children() {
          return createComponent(StatusBarGroup, {
            staged,
            setStaged
          });
        }
      }), null);
      insert(_el$6, createComponent(SettingsGroup, {
        title: "\u56FE\u8868",
        icon: "graph-line",
        get open() {
          return groupsOpen.chart;
        },
        onToggle: () => setGroupsOpen("chart", (o) => !o),
        get children() {
          return createComponent(ChartGroup, {
            staged,
            setStaged,
            get yRatio() {
              return yRatio();
            },
            setYRatio
          });
        }
      }), null);
      insert(_el$6, createComponent(SettingsGroup, {
        title: "\u5E38\u89C4",
        icon: "gear",
        get open() {
          return groupsOpen.general;
        },
        onToggle: () => setGroupsOpen("general", (o) => !o),
        get children() {
          return createComponent(GeneralGroup, {
            staged,
            setStaged
          });
        }
      }), null);
      insert(_el$6, createComponent(SettingsGroup, {
        title: "API Key",
        icon: "key",
        get open() {
          return groupsOpen.apiKey;
        },
        onToggle: () => setGroupsOpen("apiKey", (o) => !o),
        get children() {
          return createComponent(ApiKeyGroup, {});
        }
      }), null);
      insert(_el$6, createComponent(SettingsGroup, {
        title: "\u6570\u636E",
        icon: "database",
        get open() {
          return groupsOpen.data;
        },
        onToggle: () => setGroupsOpen("data", (o) => !o),
        get children() {
          return createComponent(DataGroup, {});
        }
      }), null);
      insert(_el$6, createComponent(SettingsGroup, {
        title: "\u5176\u4ED6",
        icon: "ellipsis",
        get open() {
          return groupsOpen.misc;
        },
        onToggle: () => setGroupsOpen("misc", (o) => !o),
        get children() {
          return createComponent(MiscGroup, {});
        }
      }), null);
      _el$8.$$click = () => postMessage({
        type: "openNativeSettings"
      });
      _el$9.$$click = close;
      _el$0.$$click = save;
      return _el$;
    })();
  }
  delegateEvents(["pointerdown", "click"]);

  // webview/components/RefreshButton.tsx
  var _tmpl$40 = /* @__PURE__ */ template(`<button><i>`);
  function RefreshButton() {
    const refreshIcon = createMemo(() => {
      if (store.refreshing) return "codicon-refresh spinning";
      if (store.refreshResult === "ok") return "codicon-check";
      if (store.refreshResult === "fail") return "codicon-error";
      return "codicon-refresh";
    });
    const refreshTitle = createMemo(() => {
      if (store.refreshing) return "\u67E5\u8BE2\u4E2D\u2026";
      if (store.refreshResult === "ok") return "\u5237\u65B0\u6210\u529F";
      if (store.refreshResult === "fail") return `\u5237\u65B0\u5931\u8D25\uFF1A${store.lastError || "\u8BF7\u67E5\u770B\u5E95\u90E8\u9519\u8BEF\u63D0\u793A"}`;
      return "\u7ACB\u5373\u67E5\u8BE2\u4F59\u989D";
    });
    return (() => {
      var _el$ = _tmpl$40(), _el$2 = _el$.firstChild;
      addEventListener(_el$, "click", checkNow, true);
      createRenderEffect((_p$) => {
        var _v$ = `icon${store.refreshing ? " refreshing" : ""}${store.refreshResult === "ok" ? " ok" : ""}${store.refreshResult === "fail" ? " fail" : ""}`, _v$2 = refreshTitle(), _v$3 = store.refreshing, _v$4 = `codicon ${refreshIcon()}`;
        _v$ !== _p$.e && className(_el$, _p$.e = _v$);
        _v$2 !== _p$.t && setAttribute(_el$, "title", _p$.t = _v$2);
        _v$3 !== _p$.a && (_el$.disabled = _p$.a = _v$3);
        _v$4 !== _p$.o && className(_el$2, _p$.o = _v$4);
        return _p$;
      }, {
        e: void 0,
        t: void 0,
        a: void 0,
        o: void 0
      });
      return _el$;
    })();
  }
  delegateEvents(["click"]);

  // webview/components/App.tsx
  var _tmpl$41 = /* @__PURE__ */ template(`<button class=btn title=\u91CD\u7F6E\u89C6\u56FE\u8303\u56F4>\u91CD\u7F6E`);
  var _tmpl$218 = /* @__PURE__ */ template(`<div id=app><header><div class=controls><button class=icon title="\u5728\u6D4F\u89C8\u5668\u6253\u5F00 DeepSeek \u7528\u91CF\u9875"><i class="codicon codicon-link-external"></i></button></div></header><footer>`);
  function App() {
    createEffect(() => {
      const r = store.refreshResult;
      if (!r) return;
      const t = setTimeout(() => clearRefreshFeedback(), 1800);
      onCleanup(() => clearTimeout(t));
    });
    return (() => {
      var _el$ = _tmpl$218(), _el$2 = _el$.firstChild, _el$3 = _el$2.firstChild, _el$5 = _el$3.firstChild, _el$6 = _el$2.nextSibling;
      insert(_el$2, createComponent(Header, {}), _el$3);
      insert(_el$3, createComponent(Show, {
        get when() {
          return store.chartMode === "balance";
        },
        get children() {
          return [createComponent(Ranges, {}), (() => {
            var _el$4 = _tmpl$41();
            addEventListener(_el$4, "click", resetView, true);
            return _el$4;
          })()];
        }
      }), _el$5);
      insert(_el$3, createComponent(Tabs, {}), _el$5);
      insert(_el$3, createComponent(RefreshButton, {}), _el$5);
      addEventListener(_el$5, "click", openUsage, true);
      insert(_el$, createComponent(Show, {
        get when() {
          return store.chartMode === "balance";
        },
        get fallback() {
          return createComponent(ChartBars, {});
        },
        get children() {
          return createComponent(Chart, {});
        }
      }), _el$6);
      insert(_el$6, createComponent(Footer, {}));
      insert(_el$, createComponent(Show, {
        get when() {
          return store.settingsOpen;
        },
        get children() {
          return createComponent(Settings, {
            onClose: closeSettings
          });
        }
      }), null);
      return _el$;
    })();
  }
  delegateEvents(["click"]);

  // webview/index.tsx
  var vscode = acquireVsCodeApi();
  initMessaging(vscode);
  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (!msg || !msg.type) return;
    if (msg.type === "init") {
      init(msg.payload);
    } else if (msg.type === "snapshot") {
      onSnapshot(msg.payload);
    } else if (msg.type === "config") {
      onConfig(msg.payload);
    } else if (msg.type === "settingsReset") {
      onSettingsReset();
    } else if (msg.type === "theme") {
      onTheme();
    } else if (msg.type === "error") {
      onError(msg.payload && msg.payload.message);
    }
  });
  render(() => createComponent(App, {}), document.getElementById("app"));
  postMessage({
    type: "ready"
  });
})();
//# sourceMappingURL=chart.bundle.js.map
