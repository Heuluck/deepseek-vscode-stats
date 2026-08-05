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
      c.fn = (x) => {
        track();
        if (Transition && Transition.running) {
          if (!inTransition) inTransition = ExternalSourceConfig.factory(sourceFn, triggerInTransition);
          return inTransition.track(x);
        }
        return ordinary.track(x);
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
      const path = e.composedPath();
      retarget(path[0]);
      for (let i = 0; i < path.length - 2; i++) {
        node = path[i];
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
  function updatePath(current, path, traversed = []) {
    let part, prev = current;
    if (path.length > 1) {
      part = path.shift();
      const partType = typeof part, isArray = Array.isArray(current);
      if (partType === "string" && (part === "__proto__" || path.length > 1 && isUnsafeKey$1(part))) {
        return;
      }
      if (Array.isArray(part)) {
        for (let i = 0; i < part.length; i++) {
          updatePath(current, [part[i]].concat(path), traversed);
        }
        return;
      } else if (isArray && partType === "function") {
        for (let i = 0; i < current.length; i++) {
          if (part(current[i], i)) updatePath(current, [i].concat(path), traversed);
        }
        return;
      } else if (isArray && partType === "object") {
        const {
          from = 0,
          to = current.length - 1,
          by = 1
        } = part;
        for (let i = from; i <= to; i += by) {
          updatePath(current, [i].concat(path), traversed);
        }
        return;
      } else if (path.length > 1) {
        updatePath(current[part], path, [part].concat(traversed));
        return;
      }
      prev = current[part];
      traversed = [part].concat(traversed);
    }
    let value = path[0];
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
  function startOfDay(t) {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
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
    const r = cfg.ranges.find((x) => x.key === rangeKey) || cfg.ranges[0];
    return r ? r.ms : Infinity;
  }
  function viewPoints(data, view) {
    if (!data) return [];
    if (view === "hourly") {
      return data.snapshots.slice().sort((a, b) => a.t - b.t);
    }
    if (view === "daily") {
      return data.daily.slice().sort((a, b) => a.day - b.day).map((x) => ({
        t: x.day,
        total: x.total,
        toppedUp: x.toppedUp,
        granted: x.granted,
        currency: x.currency
      }));
    }
    const byMonth = /* @__PURE__ */ new Map();
    for (const x of data.daily) {
      const m = startOfDay(new Date(x.day).setDate(1));
      byMonth.set(m, x);
    }
    return Array.from(byMonth.entries()).sort((a, b) => a[0] - b[0]).map(([t, x]) => ({
      t,
      total: x.total,
      toppedUp: x.toppedUp,
      granted: x.granted,
      currency: x.currency
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
      if (start < bounds.minT) {
        start = bounds.minT;
        end = start + ms;
      }
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
      return { viewRange: { start: vs.viewRange.start, end: bounds.maxT } };
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
    yMinSpanRatio: 0.2
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
      lineStyle: cfg.lineStyle || "straight"
    } : {
      statusBarShow: true,
      defaultColor: "",
      thresholds: [],
      pollMinutes: 1,
      rawRetentionDays: 7,
      showTodaySpend: false,
      connectorStyle: "dashed",
      connectorColor: "",
      lineStyle: "straight"
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
      lastError: ""
    });
  }
  function onSnapshot(s) {
    if (!store.data) return;
    const daily = upsertDailyLocal(store.data.daily, s);
    const data = {
      ...store.data,
      snapshots: [...store.data.snapshots, s],
      daily,
      current: s
    };
    const patch = onNewData(data, viewState());
    setStore({
      data,
      ...patch,
      ...store.refreshing ? { refreshing: false, refreshResult: "ok" } : {}
    });
  }
  function onConfig(cfg) {
    setStore({ config: cfg });
  }
  function applySavedConfig(p) {
    setStore("config", (cfg) => cfg ? { ...cfg, ...p } : cfg);
  }
  function setYMinSpanRatio(ratio) {
    setStore({ yMinSpanRatio: ratio });
  }
  function onSettingsReset() {
    setStore({ settingsOpen: false, yMinSpanRatio: 0.2 });
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

  // webview/logic/todaySpend.ts
  function computeTodaySpend(data) {
    if (!data || !data.snapshots || !data.snapshots.length) return null;
    const snapshots = data.snapshots.slice().sort((a, b) => a.t - b.t);
    const current = snapshots[snapshots.length - 1];
    const todayStart = startOfDay(Date.now());
    const yesterdayStart = todayStart - 864e5;
    let baseline = null;
    let source = "";
    const yesterdayDaily = (data.daily || []).find((x) => x.day === yesterdayStart);
    if (yesterdayDaily) {
      baseline = yesterdayDaily.total;
      source = "\u6628\u65E5\u4F59\u989D";
    } else {
      const firstToday = snapshots.find((s) => s.t >= todayStart);
      if (firstToday) {
        baseline = firstToday.total;
        source = "\u4ECA\u65E5\u9996\u6761\u5FEB\u7167";
      }
    }
    if (baseline == null) return { spend: null, source: null, baseline: null };
    return { spend: Math.max(0, baseline - current.total), source, baseline };
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
      const info = computeTodaySpend(store.data);
      if (!info || info.spend == null) {
        return {
          value: "\u2014",
          title: "\u6570\u636E\u4E0D\u8DB3\uFF0C\u65E0\u6CD5\u4F30\u7B97\u4ECA\u65E5\u82B1\u8D39"
        };
      }
      const currency = store.data && store.data.current && store.data.current.currency || "CNY";
      return {
        value: `~${fmtMoney(info.spend, currency)}`,
        title: `\u4F30\u7B97\uFF1A\u57FA\u4E8E${info.source} \xA5${info.baseline} \u63A8\u7B97\uFF0C\u53EF\u80FD\u56E0\u5145\u503C\u6216\u6570\u636E\u65AD\u6863\u800C\u4E0D\u51C6\u786E`
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
  function Tabs() {
    return (() => {
      var _el$ = _tmpl$3();
      insert(_el$, createComponent(For, {
        get each() {
          return Object.entries(VIEWS);
        },
        children: ([key, cfg]) => (() => {
          var _el$2 = _tmpl$22();
          _el$2.$$click = () => setView(key);
          insert(_el$2, () => cfg.label);
          createRenderEffect(() => className(_el$2, "tab" + (key === store.view ? " active" : "")));
          return _el$2;
        })()
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
  var _tmpl$24 = /* @__PURE__ */ template(`<span class=footer-right><span class=err></span><button class=btn title=\u8BBE\u7F6E><i class="codicon codicon-gear"></i>\u8BBE\u7F6E`);
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
      var _el$2 = _tmpl$24(), _el$3 = _el$2.firstChild, _el$4 = _el$3.nextSibling;
      insert(_el$3, (() => {
        var _c$ = memo(() => !!store.lastError);
        return () => _c$() ? `\u26A0 ${store.lastError}` : "";
      })());
      addEventListener(_el$4, "click", openSettings, true);
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
      const slice = pts.slice(i, i + bucket);
      let minP = slice[0];
      let maxP = slice[0];
      for (const p of slice) {
        if (p.total < minP.total) minP = p;
        if (p.total > maxP.total) maxP = p;
      }
      out.push(slice[0]);
      if (minP !== slice[0] && minP !== slice[slice.length - 1]) out.push(minP);
      if (maxP !== slice[0] && maxP !== slice[slice.length - 1] && maxP !== minP) out.push(maxP);
      out.push(slice[slice.length - 1]);
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

  // webview/logic/paths.ts
  function straightPath(pts, xOf, yOf) {
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.t).toFixed(1)},${yOf(p.total).toFixed(1)}`).join(" ");
  }
  function smoothPath(pts, xOf, yOf) {
    const n = pts.length;
    if (n < 2) return "";
    const s = new Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
      const h = pts[i + 1].t - pts[i].t;
      s[i] = h > 0 ? (pts[i + 1].total - pts[i].total) / h : 0;
    }
    const m = new Array(n);
    m[0] = s[0];
    m[n - 1] = s[n - 2];
    for (let i = 1; i < n - 1; i++) {
      m[i] = s[i - 1] * s[i] <= 0 ? 0 : (s[i - 1] + s[i]) / 2;
    }
    for (let i = 0; i < n - 1; i++) {
      if (s[i] === 0) {
        m[i] = 0;
        m[i + 1] = 0;
        continue;
      }
      const alpha = m[i] / s[i];
      const beta = m[i + 1] / s[i];
      const a2b2 = alpha * alpha + beta * beta;
      if (a2b2 > 9) {
        const tau = 3 / Math.sqrt(a2b2);
        m[i] = tau * alpha * s[i];
        m[i + 1] = tau * beta * s[i];
      }
    }
    let d = `M${xOf(pts[0].t).toFixed(1)},${yOf(pts[0].total).toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const h = pts[i + 1].t - pts[i].t;
      const c1x = xOf(pts[i].t) + (xOf(pts[i + 1].t) - xOf(pts[i].t)) / 3;
      const c1y = yOf(pts[i].total + m[i] * h / 3);
      const c2x = xOf(pts[i + 1].t) - (xOf(pts[i + 1].t) - xOf(pts[i].t)) / 3;
      const c2y = yOf(pts[i + 1].total - m[i + 1] * h / 3);
      d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${xOf(
        pts[i + 1].t
      ).toFixed(1)},${yOf(pts[i + 1].total).toFixed(1)}`;
    }
    return d;
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
      const tau = 3 / Math.sqrt(a2b2);
      m1 = tau * alpha * s;
      m2 = tau * beta * s;
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
      const tw = ref.offsetWidth;
      const th = ref.offsetHeight;
      const ww = wrap ? wrap.clientWidth : 0;
      let tx = info.pointX + 14;
      if (tx + tw > ww - 8) tx = info.pointX - tw - 14;
      if (tx < 8) tx = 8;
      let ty = info.pointY - th - 12;
      if (ty < 8) ty = info.pointY + 14;
      setPos({
        left: tx,
        top: ty
      });
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

  // webview/components/Chart.tsx
  var _tmpl$8 = /* @__PURE__ */ template(`<svg><defs><clipPath id=plotClip><rect></svg>`, false, true, false);
  var _tmpl$27 = /* @__PURE__ */ template(`<svg><g class=axis></svg>`, false, true, false);
  var _tmpl$32 = /* @__PURE__ */ template(`<svg><g clip-path=url(#plotClip)></svg>`, false, true, false);
  var _tmpl$42 = /* @__PURE__ */ template(`<svg><line class=crosshair></svg>`, false, true, false);
  var _tmpl$52 = /* @__PURE__ */ template(`<svg><circle class=hover-dot r=4></svg>`, false, true, false);
  var _tmpl$62 = /* @__PURE__ */ template(`<main id=chartWrap><svg id=chart>`);
  var _tmpl$72 = /* @__PURE__ */ template(`<svg><line class=grid></svg>`, false, true, false);
  var _tmpl$82 = /* @__PURE__ */ template(`<svg><text text-anchor=end dominant-baseline=middle></svg>`, false, true, false);
  var _tmpl$9 = /* @__PURE__ */ template(`<svg><text dominant-baseline=hanging></svg>`, false, true, false);
  var _tmpl$0 = /* @__PURE__ */ template(`<svg><path></svg>`, false, true, false);
  var _tmpl$1 = /* @__PURE__ */ template(`<svg><path class=area></svg>`, false, true, false);
  var _tmpl$10 = /* @__PURE__ */ template(`<svg><path class=line></svg>`, false, true, false);
  var _tmpl$11 = /* @__PURE__ */ template(`<svg><circle class="line isolated"r=3></svg>`, false, true, false);
  function Chart() {
    let wrapRef;
    let svgRef;
    const [size, setSize] = createSignal({
      w: 0,
      h: 0
    });
    const [mouseX, setMouseX] = createSignal(-1);
    const [pinT, setPinT] = createSignal(null);
    const [pinUntil, setPinUntil] = createSignal(0);
    let zoomAnchorT = null;
    let zoomAnchorFrac = 0;
    let lastWheelTs = 0;
    let drag = null;
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
          const y = yOf(v);
          const isEdge = i === 0 || i === yTicks.length - 1;
          if (!isEdge && lastY - y < 16) continue;
          yLabels.push({
            v,
            y,
            text: fmtAxisMoney(v, currency)
          });
          lastY = y;
        }
      }
      const dur = t1 - t0;
      const xStep = niceTimeStep(dur);
      const xTicks = [];
      for (let t = Math.ceil(t0 / xStep) * xStep; t <= t1 + 1e-9; t += xStep) xTicks.push(t);
      const xLabels = [];
      {
        const all = xTicks.map((t) => {
          const x = xOf(t);
          const text = fmtAxisTime(t, xStep, view);
          return {
            t,
            x,
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
      const plotW = lay.plotRight - lay.plotLeft;
      const plotH = lay.h - M.bottom;
      const out = [];
      for (const g of cd.geom.gaps) {
        let d;
        if (smooth) {
          d = polylineToClippedPath(flattenSmoothSegment(g.prev ?? g.from, g.from, g.to, g.next ?? g.to, xOf, yOf), plotX, plotY, plotW, plotH);
        } else {
          const seg = clipSegmentToRect(xOf(g.from.t), yOf(g.from.total), xOf(g.to.t), yOf(g.to.total), plotX, plotY, plotW, plotH);
          if (!seg) continue;
          d = `M${seg[0].toFixed(1)},${seg[1].toFixed(1)} L${seg[2].toFixed(1)},${seg[3].toFixed(1)}`;
        }
        if (d) out.push({
          d,
          solid: style2 === "solid",
          color
        });
      }
      return out;
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
    onMount(() => {
      const svg = svgRef;
      const container = wrapRef;
      function onWheel(e) {
        e.preventDefault();
        if (!store.viewRange) return;
        const lay = layout();
        if (!lay) return;
        const now = Date.now();
        const rect = svg.getBoundingClientRect();
        const innerW = rect.width - lay.plotLeft - M.right;
        if (innerW <= 0) return;
        const mx = e.clientX - rect.left;
        const vr = store.viewRange;
        const tCursor = vr.start + (mx - lay.plotLeft) / innerW * (vr.end - vr.start);
        if (now - lastWheelTs > 300) {
          const cd = chartData();
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
        const r = bounds ? clampRange(zoomAnchorT - zoomAnchorFrac * dur, zoomAnchorT + (1 - zoomAnchorFrac) * dur, bounds, store.minWindow) : {
          start: zoomAnchorT - zoomAnchorFrac * dur,
          end: zoomAnchorT + (1 - zoomAnchorFrac) * dur
        };
        setViewRange(r, false);
      }
      function onPointerDown(e) {
        if (e.button !== 0 || !store.viewRange) return;
        drag = {
          startX: e.clientX,
          startRange: {
            ...store.viewRange
          }
        };
        setMouseX(-1);
        container.setPointerCapture(e.pointerId);
      }
      function onPointerMove(e) {
        if (!drag || !store.viewRange) return;
        const lay = layout();
        if (!lay) return;
        const rect = svg.getBoundingClientRect();
        const innerW = rect.width - lay.plotLeft - M.right;
        const dur = drag.startRange.end - drag.startRange.start;
        const shift = (drag.startX - e.clientX) / innerW * dur;
        const bounds = computeDataBounds(store.data, store.view);
        const r = bounds ? clampRange(drag.startRange.start + shift, drag.startRange.end + shift, bounds, store.minWindow) : {
          start: drag.startRange.start + shift,
          end: drag.startRange.end + shift
        };
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
      container.addEventListener("wheel", onWheel, {
        passive: false
      });
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
    return (() => {
      var _el$ = _tmpl$62(), _el$2 = _el$.firstChild;
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
            var _el$3 = _tmpl$8(), _el$4 = _el$3.firstChild, _el$5 = _el$4.firstChild;
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
          })(), (() => {
            var _el$6 = _tmpl$27();
            insert(_el$6, createComponent(For, {
              get each() {
                return layout().yTicks;
              },
              children: (v) => {
                const lay = layout();
                const y = lay.yOf(v);
                return (() => {
                  var _el$1 = _tmpl$72();
                  setAttribute(_el$1, "y1", y);
                  setAttribute(_el$1, "y2", y);
                  createRenderEffect((_p$) => {
                    var _v$11 = lay.plotLeft, _v$12 = lay.plotRight;
                    _v$11 !== _p$.e && setAttribute(_el$1, "x1", _p$.e = _v$11);
                    _v$12 !== _p$.t && setAttribute(_el$1, "x2", _p$.t = _v$12);
                    return _p$;
                  }, {
                    e: void 0,
                    t: void 0
                  });
                  return _el$1;
                })();
              }
            }), null);
            insert(_el$6, createComponent(For, {
              get each() {
                return layout().yLabels;
              },
              children: (lbl) => {
                const lay = layout();
                return (() => {
                  var _el$10 = _tmpl$82();
                  insert(_el$10, () => lbl.text);
                  createRenderEffect((_p$) => {
                    var _v$13 = lay.plotLeft - 8, _v$14 = lbl.y;
                    _v$13 !== _p$.e && setAttribute(_el$10, "x", _p$.e = _v$13);
                    _v$14 !== _p$.t && setAttribute(_el$10, "y", _p$.t = _v$14);
                    return _p$;
                  }, {
                    e: void 0,
                    t: void 0
                  });
                  return _el$10;
                })();
              }
            }), null);
            return _el$6;
          })(), (() => {
            var _el$7 = _tmpl$27();
            insert(_el$7, createComponent(For, {
              get each() {
                return layout().xTicks;
              },
              children: (t) => {
                const lay = layout();
                const x = lay.xOf(t);
                return (() => {
                  var _el$11 = _tmpl$72();
                  setAttribute(_el$11, "x1", x);
                  setAttribute(_el$11, "x2", x);
                  createRenderEffect((_p$) => {
                    var _v$15 = M.top, _v$16 = lay.h - M.bottom;
                    _v$15 !== _p$.e && setAttribute(_el$11, "y1", _p$.e = _v$15);
                    _v$16 !== _p$.t && setAttribute(_el$11, "y2", _p$.t = _v$16);
                    return _p$;
                  }, {
                    e: void 0,
                    t: void 0
                  });
                  return _el$11;
                })();
              }
            }), null);
            insert(_el$7, createComponent(For, {
              get each() {
                return layout().xLabels;
              },
              children: (lbl) => {
                const lay = layout();
                return (() => {
                  var _el$12 = _tmpl$9();
                  insert(_el$12, () => lbl.text);
                  createRenderEffect((_p$) => {
                    var _v$17 = lbl.x, _v$18 = lay.h - M.bottom + 16, _v$19 = lbl.anchor;
                    _v$17 !== _p$.e && setAttribute(_el$12, "x", _p$.e = _v$17);
                    _v$18 !== _p$.t && setAttribute(_el$12, "y", _p$.t = _v$18);
                    _v$19 !== _p$.a && setAttribute(_el$12, "text-anchor", _p$.a = _v$19);
                    return _p$;
                  }, {
                    e: void 0,
                    t: void 0,
                    a: void 0
                  });
                  return _el$12;
                })();
              }
            }), null);
            return _el$7;
          })(), (() => {
            var _el$8 = _tmpl$32();
            insert(_el$8, createComponent(For, {
              get each() {
                return connectorDraws();
              },
              children: (c) => (() => {
                var _el$13 = _tmpl$0();
                createRenderEffect((_p$) => {
                  var _v$20 = "connector" + (c.solid ? " solid" : ""), _v$21 = c.d, _v$22 = c.color ? {
                    stroke: c.color
                  } : void 0;
                  _v$20 !== _p$.e && setAttribute(_el$13, "class", _p$.e = _v$20);
                  _v$21 !== _p$.t && setAttribute(_el$13, "d", _p$.t = _v$21);
                  _p$.a = style(_el$13, _v$22, _p$.a);
                  return _p$;
                }, {
                  e: void 0,
                  t: void 0,
                  a: void 0
                });
                return _el$13;
              })()
            }), null);
            insert(_el$8, createComponent(For, {
              get each() {
                return solidDraws();
              },
              children: (s) => [(() => {
                var _el$14 = _tmpl$1();
                createRenderEffect(() => setAttribute(_el$14, "d", s.area));
                return _el$14;
              })(), (() => {
                var _el$15 = _tmpl$10();
                createRenderEffect(() => setAttribute(_el$15, "d", s.d));
                return _el$15;
              })()]
            }), null);
            insert(_el$8, createComponent(For, {
              get each() {
                return chartData().geom.isolated;
              },
              children: (p) => {
                const lay = layout();
                return (() => {
                  var _el$16 = _tmpl$11();
                  createRenderEffect((_p$) => {
                    var _v$23 = lay.xOf(p.t), _v$24 = lay.yOf(p.total);
                    _v$23 !== _p$.e && setAttribute(_el$16, "cx", _p$.e = _v$23);
                    _v$24 !== _p$.t && setAttribute(_el$16, "cy", _p$.t = _v$24);
                    return _p$;
                  }, {
                    e: void 0,
                    t: void 0
                  });
                  return _el$16;
                })();
              }
            }), null);
            return _el$8;
          })(), createComponent(Show, {
            get when() {
              return hover();
            },
            get children() {
              return [(() => {
                var _el$9 = _tmpl$42();
                createRenderEffect((_p$) => {
                  var _v$5 = hover().x, _v$6 = M.top, _v$7 = hover().x, _v$8 = size().h - M.bottom;
                  _v$5 !== _p$.e && setAttribute(_el$9, "x1", _p$.e = _v$5);
                  _v$6 !== _p$.t && setAttribute(_el$9, "y1", _p$.t = _v$6);
                  _v$7 !== _p$.a && setAttribute(_el$9, "x2", _p$.a = _v$7);
                  _v$8 !== _p$.o && setAttribute(_el$9, "y2", _p$.o = _v$8);
                  return _p$;
                }, {
                  e: void 0,
                  t: void 0,
                  a: void 0,
                  o: void 0
                });
                return _el$9;
              })(), (() => {
                var _el$0 = _tmpl$52();
                createRenderEffect((_p$) => {
                  var _v$9 = hover().x, _v$0 = hover().y;
                  _v$9 !== _p$.e && setAttribute(_el$0, "cx", _p$.e = _v$9);
                  _v$0 !== _p$.t && setAttribute(_el$0, "cy", _p$.t = _v$0);
                  return _p$;
                }, {
                  e: void 0,
                  t: void 0
                });
                return _el$0;
              })()];
            }
          })];
        }
      }));
      insert(_el$, createComponent(Tooltip, {}), null);
      insert(_el$, createComponent(Empty, {}), null);
      createRenderEffect((_p$) => {
        var _v$1 = size().w, _v$10 = size().h;
        _v$1 !== _p$.e && setAttribute(_el$2, "width", _p$.e = _v$1);
        _v$10 !== _p$.t && setAttribute(_el$2, "height", _p$.t = _v$10);
        return _p$;
      }, {
        e: void 0,
        t: void 0
      });
      return _el$;
    })();
  }

  // webview/components/Settings.tsx
  var _tmpl$12 = /* @__PURE__ */ template(`<div class=settings-consent><p class=settings-hint>\u4ECA\u65E5\u82B1\u8D39\u4E3A\u6839\u636E\u4F59\u989D\u5FEB\u7167\u63A8\u7B97\u7684\u4F30\u7B97\u503C\uFF0C\u53EF\u80FD\u56E0\u5145\u503C\u6216\u6570\u636E\u65AD\u6863\u800C\u4E0D\u51C6\u786E\u3002</p><div class=row><button class="btn primary">\u540C\u610F\u542F\u7528</button><button class=btn>\u53D6\u6D88`);
  var _tmpl$28 = /* @__PURE__ */ template(`<div class=overlay><div class=settings-panel><div class=settings-head><span class=settings-title>DeepSeek Stats \u8BBE\u7F6E</span><button class=icon title=\u5173\u95ED><i class="codicon codicon-close"></i></button></div><div class=settings-body><div class=settings-group><div class=settings-label>\u72B6\u6001\u680F</div><label class=settings-row><span>\u663E\u793A\u4F59\u989D</span><input type=checkbox></label><button type=button><span>\u9608\u503C\u989C\u8272</span><i class="codicon codicon-chevron-down"></i></button><div><div class=settings-row><span>\u9ED8\u8BA4\u989C\u8272</span><div class=settings-controls><input type=color><label class=settings-inline><input type=checkbox>\u8DDF\u968F\u4E3B\u9898</label></div></div><div class=threshold-head><span>\u4F59\u989D\u9608\u503C\uFF08\u4F4E\u4E8E \u2192 \u989C\u8272\uFF09</span><button class="btn small"><i class="codicon codicon-add"></i>\u6DFB\u52A0</button></div><div id=thresholdList></div><p class=settings-hint>\u4F59\u989D\u4F4E\u4E8E\u9608\u503C\uFF08\u4E0D\u542B\uFF09\u65F6\u663E\u793A\u5BF9\u5E94\u989C\u8272\u3002</p></div></div><div class=settings-group><div class=settings-label>\u56FE\u8868</div><p class="settings-hint first">\u6570\u636E\u8F6E\u8BE2\u51FA\u73B0\u65AD\u6863\u65F6\uFF0C\u7528\u8FDE\u63A5\u7EBF\u628A\u7F3A\u53E3\u4E24\u7AEF\u8FDE\u8D77\u6765\u3002</p><div class=settings-row><label for=lineStyleEl>\u7EBF\u6761\u6837\u5F0F</label><select id=lineStyleEl class=settings-select><option value=straight>\u76F4\u7EBF</option><option value=smooth>\u66F2\u7EBF</option></select></div><div class=settings-row><label for=connectorStyleEl>\u65AD\u70B9\u8FDE\u63A5\u7EBF</label><select id=connectorStyleEl class=settings-select><option value=dashed>\u865A\u7EBF</option><option value=solid>\u5B9E\u7EBF</option><option value=none>\u4E0D\u8FDE\u63A5</option></select></div><div class=settings-row><span>\u8FDE\u63A5\u7EBF\u989C\u8272</span><div class=settings-controls><input type=color><label class=settings-inline><input type=checkbox>\u8DDF\u968F\u4E3B\u8272</label></div></div><div class=settings-row><label for=yMinSpanRatioEl>\u7EB5\u5411\u6700\u5C0F\u8DE8\u5EA6</label><input type=number id=yMinSpanRatioEl min=0 max=1 step=0.05 class=settings-number></div><p class=settings-hint>Y \u8F74\u8DE8\u5EA6\u81F3\u5C11\u4E3A\u6700\u5927\u503C\u7684\u8BE5\u6BD4\u4F8B\uFF0C\u9650\u5236\u66F2\u7EBF\u7EB5\u5411\u653E\u5927\uFF1B0 \u8868\u793A\u5B8C\u5168\u81EA\u9002\u5E94\u3002</p></div><div class=settings-group><div class=settings-label>\u5E38\u89C4</div><div class=settings-row><label for=pollMinutesEl>\u67E5\u8BE2\u95F4\u9694\uFF08\u5206\u949F\uFF09</label><input type=number id=pollMinutesEl min=1 step=1 class=settings-number></div><div class=settings-row><label for=rawRetentionEl>\u5206\u949F\u7EA7\u5FEB\u7167\u4FDD\u7559\uFF08\u5929\uFF09</label><input type=number id=rawRetentionEl min=1 step=1 class=settings-number></div><label class=settings-row><span>\u663E\u793A\u4ECA\u65E5\u82B1\u8D39\uFF08\u4F30\u7B97\uFF09</span><input type=checkbox></label></div><div class=settings-group><div class=settings-label>API Key</div><div class=settings-row><span></span><div class=settings-controls><button class=btn>\u8BBE\u7F6E / \u66F4\u6362</button><button class="btn danger">\u6E05\u9664</button></div></div></div><div class=settings-group><div class=settings-label>\u6570\u636E</div><div class=settings-row><span>\u5386\u53F2\u5FEB\u7167\uFF08\u4EC5 VS Code \u6253\u5F00\u671F\u95F4\u8BB0\u5F55\uFF09</span><button class="btn danger">\u6E05\u9664\u5386\u53F2</button></div></div><div class=settings-group><div class=settings-label>\u5176\u4ED6</div><div class=settings-row><span>\u6062\u590D\u9ED8\u8BA4\u8BBE\u7F6E</span><button class="btn danger">\u6062\u590D\u9ED8\u8BA4</button></div></div></div><div class=settings-foot><button class=btn><i class="codicon codicon-settings-gear"></i>\u6253\u5F00 VS Code \u8BBE\u7F6E</button><button class=btn>\u53D6\u6D88</button><button class="btn primary"><i class="codicon codicon-check"></i>\u4FDD\u5B58`);
  var _tmpl$33 = /* @__PURE__ */ template(`<div class=threshold-row><input type=number class=threshold-below min=0 step=0.01><span class=sep>\u4EE5\u4E0B</span><input type=color class=threshold-color><button class="icon threshold-del"title=\u5220\u9664\u8BE5\u9608\u503C><i class="codicon codicon-trash">`);
  function Settings(props) {
    const [colorOpen, setColorOpen] = createSignal(false);
    const [consent, setConsent] = createSignal(false);
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
        thresholds: staged.thresholds.map((t) => ({
          below: t.below,
          color: t.color
        })).sort((a, b) => a.below - b.below),
        pollMinutes: staged.pollMinutes,
        rawRetentionDays: staged.rawRetentionDays,
        showTodaySpend: staged.showTodaySpend,
        connectorStyle: staged.connectorStyle,
        connectorColor: staged.connectorColor,
        lineStyle: staged.lineStyle
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
    function addThreshold() {
      setStaged("thresholds", (ts) => [...ts, {
        below: 100,
        color: "#ffb900"
      }]);
    }
    return (() => {
      var _el$ = _tmpl$28(), _el$2 = _el$.firstChild, _el$3 = _el$2.firstChild, _el$4 = _el$3.firstChild, _el$5 = _el$4.nextSibling, _el$6 = _el$3.nextSibling, _el$7 = _el$6.firstChild, _el$8 = _el$7.firstChild, _el$9 = _el$8.nextSibling, _el$0 = _el$9.firstChild, _el$1 = _el$0.nextSibling, _el$10 = _el$9.nextSibling, _el$11 = _el$10.nextSibling, _el$12 = _el$11.firstChild, _el$13 = _el$12.firstChild, _el$14 = _el$13.nextSibling, _el$15 = _el$14.firstChild, _el$16 = _el$15.nextSibling, _el$17 = _el$16.firstChild, _el$18 = _el$12.nextSibling, _el$19 = _el$18.firstChild, _el$20 = _el$19.nextSibling, _el$21 = _el$18.nextSibling, _el$22 = _el$7.nextSibling, _el$23 = _el$22.firstChild, _el$24 = _el$23.nextSibling, _el$25 = _el$24.nextSibling, _el$26 = _el$25.firstChild, _el$27 = _el$26.nextSibling, _el$28 = _el$25.nextSibling, _el$29 = _el$28.firstChild, _el$30 = _el$29.nextSibling, _el$31 = _el$28.nextSibling, _el$32 = _el$31.firstChild, _el$33 = _el$32.nextSibling, _el$34 = _el$33.firstChild, _el$35 = _el$34.nextSibling, _el$36 = _el$35.firstChild, _el$37 = _el$31.nextSibling, _el$38 = _el$37.firstChild, _el$39 = _el$38.nextSibling, _el$40 = _el$22.nextSibling, _el$41 = _el$40.firstChild, _el$42 = _el$41.nextSibling, _el$43 = _el$42.firstChild, _el$44 = _el$43.nextSibling, _el$45 = _el$42.nextSibling, _el$46 = _el$45.firstChild, _el$47 = _el$46.nextSibling, _el$48 = _el$45.nextSibling, _el$49 = _el$48.firstChild, _el$50 = _el$49.nextSibling, _el$56 = _el$40.nextSibling, _el$57 = _el$56.firstChild, _el$58 = _el$57.nextSibling, _el$59 = _el$58.firstChild, _el$60 = _el$59.nextSibling, _el$61 = _el$60.firstChild, _el$62 = _el$61.nextSibling, _el$63 = _el$56.nextSibling, _el$64 = _el$63.firstChild, _el$65 = _el$64.nextSibling, _el$66 = _el$65.firstChild, _el$67 = _el$66.nextSibling, _el$68 = _el$63.nextSibling, _el$69 = _el$68.firstChild, _el$70 = _el$69.nextSibling, _el$71 = _el$70.firstChild, _el$72 = _el$71.nextSibling, _el$73 = _el$6.nextSibling, _el$74 = _el$73.firstChild, _el$75 = _el$74.nextSibling, _el$76 = _el$75.nextSibling;
      _el$.$$pointerdown = (e) => {
        if (e.target === e.currentTarget) close();
      };
      _el$5.$$click = close;
      _el$1.addEventListener("change", (e) => setStaged("statusBarShow", e.currentTarget.checked));
      _el$10.$$click = () => setColorOpen((o) => !o);
      _el$15.addEventListener("change", (e) => {
        setStaged("defaultColor", e.currentTarget.value);
      });
      _el$17.addEventListener("change", (e) => {
        const theme = e.currentTarget.checked;
        setStaged("defaultColor", theme ? "" : "#000000");
      });
      _el$20.$$click = addThreshold;
      insert(_el$21, createComponent(For, {
        get each() {
          return staged?.thresholds ?? [];
        },
        children: (t, i) => (() => {
          var _el$77 = _tmpl$33(), _el$78 = _el$77.firstChild, _el$79 = _el$78.nextSibling, _el$80 = _el$79.nextSibling, _el$81 = _el$80.nextSibling;
          _el$78.$$input = (e) => setStaged("thresholds", i(), "below", parseFloat(e.currentTarget.value));
          _el$80.addEventListener("change", (e) => setStaged("thresholds", i(), "color", e.currentTarget.value));
          _el$81.$$click = () => setStaged("thresholds", (ts) => ts.filter((_, idx) => idx !== i()));
          createRenderEffect(() => _el$78.value = t.below);
          createRenderEffect(() => _el$80.value = t.color);
          return _el$77;
        })()
      }));
      _el$27.addEventListener("change", (e) => setStaged("lineStyle", e.currentTarget.value));
      _el$30.addEventListener("change", (e) => setStaged("connectorStyle", e.currentTarget.value));
      _el$34.addEventListener("change", (e) => setStaged("connectorColor", e.currentTarget.value));
      _el$36.addEventListener("change", (e) => {
        const theme = e.currentTarget.checked;
        setStaged("connectorColor", theme ? "" : "#000000");
      });
      _el$39.addEventListener("change", (e) => {
        const v = Number(e.currentTarget.value);
        if (Number.isFinite(v)) setYRatio(Math.min(1, Math.max(0, v)));
      });
      _el$44.addEventListener("change", (e) => {
        const v = parseInt(e.currentTarget.value, 10);
        if (Number.isFinite(v) && v >= 1) setStaged("pollMinutes", v);
      });
      _el$47.addEventListener("change", (e) => {
        const v = parseInt(e.currentTarget.value, 10);
        if (Number.isFinite(v) && v >= 1) setStaged("rawRetentionDays", v);
      });
      _el$50.addEventListener("change", (e) => {
        if (e.currentTarget.checked) {
          setConsent(true);
        } else {
          setStaged("showTodaySpend", false);
          setConsent(false);
        }
      });
      insert(_el$40, createComponent(Show, {
        get when() {
          return consent();
        },
        get children() {
          var _el$51 = _tmpl$12(), _el$52 = _el$51.firstChild, _el$53 = _el$52.nextSibling, _el$54 = _el$53.firstChild, _el$55 = _el$54.nextSibling;
          _el$54.$$click = () => {
            setStaged("showTodaySpend", true);
            setConsent(false);
          };
          _el$55.$$click = () => {
            setStaged("showTodaySpend", false);
            setConsent(false);
          };
          return _el$51;
        }
      }), null);
      insert(_el$59, () => store.data && store.data.hasKey ? "\u5DF2\u914D\u7F6E\uFF08\u5B58\u50A8\u4E8E\u7CFB\u7EDF\u94A5\u5319\u4E32\uFF09" : "\u672A\u914D\u7F6E");
      _el$61.$$click = () => postMessage({
        type: "setApiKey"
      });
      _el$62.$$click = () => postMessage({
        type: "clearApiKey"
      });
      _el$67.$$click = () => postMessage({
        type: "clearHistory"
      });
      _el$72.$$click = () => postMessage({
        type: "resetSettings"
      });
      _el$74.$$click = () => postMessage({
        type: "openNativeSettings"
      });
      _el$75.$$click = close;
      _el$76.$$click = save;
      createRenderEffect((_p$) => {
        var _v$ = "settings-toggle" + (colorOpen() ? " open" : ""), _v$2 = "settings-collapse" + (colorOpen() ? " open" : ""), _v$3 = !staged?.defaultColor, _v$4 = !staged?.connectorColor;
        _v$ !== _p$.e && className(_el$10, _p$.e = _v$);
        _v$2 !== _p$.t && className(_el$11, _p$.t = _v$2);
        _v$3 !== _p$.a && (_el$15.disabled = _p$.a = _v$3);
        _v$4 !== _p$.o && (_el$34.disabled = _p$.o = _v$4);
        return _p$;
      }, {
        e: void 0,
        t: void 0,
        a: void 0,
        o: void 0
      });
      createRenderEffect(() => _el$1.checked = staged?.statusBarShow);
      createRenderEffect(() => _el$15.value = staged?.defaultColor || "#000000");
      createRenderEffect(() => _el$17.checked = !staged?.defaultColor);
      createRenderEffect(() => _el$27.value = staged?.lineStyle ?? "straight");
      createRenderEffect(() => _el$30.value = staged?.connectorStyle ?? "dashed");
      createRenderEffect(() => _el$34.value = staged?.connectorColor || "#000000");
      createRenderEffect(() => _el$36.checked = !staged?.connectorColor);
      createRenderEffect(() => _el$39.value = yRatio());
      createRenderEffect(() => _el$44.value = staged?.pollMinutes);
      createRenderEffect(() => _el$47.value = staged?.rawRetentionDays);
      createRenderEffect(() => _el$50.checked = staged?.showTodaySpend || consent());
      return _el$;
    })();
  }
  delegateEvents(["pointerdown", "click", "input"]);

  // webview/components/App.tsx
  var _tmpl$13 = /* @__PURE__ */ template(`<div id=app><header><div class=controls><button class=btn title=\u91CD\u7F6E\u89C6\u56FE\u8303\u56F4>\u91CD\u7F6E</button><button><i></i></button><button class=icon title="\u5728\u6D4F\u89C8\u5668\u6253\u5F00 DeepSeek \u7528\u91CF\u9875"><i class="codicon codicon-link-external"></i></button></div></header><footer>`);
  function App() {
    createEffect(() => {
      const r = store.refreshResult;
      if (!r) return;
      const t = setTimeout(() => clearRefreshFeedback(), 1800);
      onCleanup(() => clearTimeout(t));
    });
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
      var _el$ = _tmpl$13(), _el$2 = _el$.firstChild, _el$3 = _el$2.firstChild, _el$4 = _el$3.firstChild, _el$5 = _el$4.nextSibling, _el$6 = _el$5.firstChild, _el$7 = _el$5.nextSibling, _el$8 = _el$2.nextSibling;
      insert(_el$2, createComponent(Header, {}), _el$3);
      insert(_el$3, createComponent(Ranges, {}), _el$4);
      insert(_el$3, createComponent(Tabs, {}), _el$4);
      addEventListener(_el$4, "click", resetView, true);
      addEventListener(_el$5, "click", checkNow, true);
      addEventListener(_el$7, "click", openUsage, true);
      insert(_el$, createComponent(Chart, {}), _el$8);
      insert(_el$8, createComponent(Footer, {}));
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
      createRenderEffect((_p$) => {
        var _v$ = `icon${store.refreshing ? " refreshing" : ""}${store.refreshResult === "ok" ? " ok" : ""}${store.refreshResult === "fail" ? " fail" : ""}`, _v$2 = refreshTitle(), _v$3 = store.refreshing, _v$4 = `codicon ${refreshIcon()}`;
        _v$ !== _p$.e && className(_el$5, _p$.e = _v$);
        _v$2 !== _p$.t && setAttribute(_el$5, "title", _p$.t = _v$2);
        _v$3 !== _p$.a && (_el$5.disabled = _p$.a = _v$3);
        _v$4 !== _p$.o && className(_el$6, _p$.o = _v$4);
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
