(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
const kvidb = require('kv-idb');
const cache = kvidb('store-solcjs');

module.exports = ajaxcache;
ajaxcache.clear = () => cache.clear();

let waitingQueue = {};

function ajaxcache(opts, done) {
  let url;
  if (opts) url = (typeof opts === 'string') ? opts : opts.url;
  if (!url) done(new Error('`url` or `{ url }` must be a string'));
  // console.log(url);
  let { transform, caching } = opts;
  let lastModified;
  if (window.localStorage[url] && caching) {
    fetch(url, { method: 'HEAD' }).then(response => {
      if (!response.ok) done(response);
      lastModified = getLastModified(response);
      if (getCacheTime(url) > lastModified) caching = true;
      cacheFetch({ cache, url, caching, transform, lastModified }, done);
    }).catch(e => {
      console.error('[error]', e);
      cacheFetch({ cache, url, caching: true, transform, lastModified: undefined }, done);
    });
  } else if (waitingQueue[url]) {
    waitingQueue[url].push(done);
  } else {
    cacheFetch({ cache, url, caching, transform, lastModified: null }, done);
  }
}

function getLastModified(response) {
  let lastModified = response.headers.get('last-modified');
  lastModified = Date.parse(lastModified) / 1000;
  return lastModified;
}

function cacheFetch({ cache, url, caching, transform, lastModified }, done) {
  const fromCache = isLatest(caching, url, lastModified);
  // console.log(`caching:${caching}, fromCache: ${fromCache}`);
  if (fromCache) return cache.get(url, done);
  waitingQueue[url] = [done];
  fetch(url)
    .then(response => response.text())
    .then(json => {
      const data = transform ? transform(json) : json;
      setCache(url, data, caching);
    }).catch(e => {
      done(e);
    });
}

function isLatest(caching, url, lastModified) {
  const condition1 = getCacheTime(url); 
  const condition2 = lastModified;
  // console.log(`cache time: ${condition1}, lastModified: ${condition2}`);
  return caching && condition1 > condition2;
}

function setCache(url, data, caching) {
  cache.put(url, data, error => {
    const listener = waitingQueue[url];
    waitingQueue[url] = undefined;
    if (error) return listener.forEach(fn => fn(error));
    setCacheTime(caching, url);
    listener.forEach(fn => fn(null, data));
  });
}

function getCacheTime(url) {
  return window.localStorage[url];
}

function setCacheTime(caching, url) {
  if (caching) {
    const dateTime = Date.now();
    let timestamp = Math.floor(dateTime / 1000);
    window.localStorage[url] = timestamp;
  }
}
},{"kv-idb":4}],2:[function(require,module,exports){
module.exports = {
  promiseAjax: require('./promiseAjax')
};
},{"./promiseAjax":3}],3:[function(require,module,exports){
const cacheAjax = require('./ajaxCache');

module.exports = promiseAjax;

function promiseAjax(opts) {
  return new Promise(function (resolve, reject) {
    try {
      cacheAjax(opts, (error, data) => {
        if (error) return reject(error);
        resolve(data);
      });
    } catch (error) {
      reject(error);
    }
  });
}
},{"./ajaxCache":1}],4:[function(require,module,exports){
const indexedDB = window.indexedDB
const console = window.console

module.exports = kvidb

const dbname = 'kvidb'
// const dbopts = { keyPath: 'key' }
const version = 1

function kvidb (opts) {
  const name = opts ? opts.name || ('' + opts) : 'store'
  const scope = `${dbname}-${name}`
  var IDB
  const makeDB = done => {
    var idb = indexedDB.open(dbname, version)
    idb.onerror = e => console.error(`[${dbname}]`, idb.error)
    idb.onupgradeneeded = () => idb.result.createObjectStore(scope/*, dbopts*/)
    idb.onsuccess = () => done(IDB = idb.result)
  }
  const use = (mode, done) => {
    const next = (IDB, tx) => (tx = IDB.transaction([scope], mode),
      done(tx.objectStore(scope), tx))
    IDB ? next(IDB) : makeDB(next)
  }
  const api = {
    get: (key, done) => use('readonly', (store, tx) => {
      const req = store.get('' + key)
      tx.oncomplete = e => next(req.error, req.result)
      const next = (e, x) => {
        e ? done(e) : x === undefined ? done(`key "${key}" is undefined`)
        : done(null, x)
      }
    }),
    put: (key, val, done) => val === undefined ? done('`value` is undefined')
      : use('readwrite', (store, tx) => {
        const req = store.put(val, '' + key)
        tx.oncomplete = e => done(req.error, !req.error)
    }),
    del: (key, done) => api.get('' + key, (e, x) => {
      e ? done(e) : use('readwrite', (store, tx) => {
        const req = store.delete('' + key)
        tx.oncomplete = e => done(req.error, !req.error)
      })
    }),
    clear: done => use('readwrite',  (store, tx) => {
      const req = store.clear()
      tx.oncomplete = e => done(req.error, !req.error)
    }),
    length: done => use('readwrite',  (store, tx) => {
      const req = store.count()
      tx.oncomplete = e => done(req.error, req.result)
    }),
    close: done => (IDB ? IDB.close() : makeDB(IDB => IDB.close()), done(null, true)),
    batch: (ops, done) => done('@TODO: implement `.batch(...)`'),
    keys: done => use('readonly', (store, tx, keys = []) => {
      const openCursor = (store.openKeyCursor || store.openCursor)
      const req = openCursor.call(store)
      tx.oncomplete = e => done(req.error, req.error ? undefined : keys)
      req.onsuccess = () => {
        const x = req.result
        if (x) (keys.push(x.key), x.continue())
      }
    })
    // key: (n, done) => (n < 0) ? done(null) : use('readonly', store => {
    //   var advanced = false
    //   var req = store.openCursor()
    //   req.onsuccess = () => {
    //     var cursor = req.result
    //     if (!cursor) return
    //     if (n === 0 || advanced) return // Either 1) maybe return first key, or 2) we've got the nth key
    //     advanced = true // Otherwise, ask the cursor to skip ahead n records
    //     cursor.advance(n)
    //   }
    //   req.onerror = () => (console.error('Error in asyncStorage.key(): '), req.error.name)
    //   req.onsuccess = () => done((req.result || {}).key || null)
    // }),
    // This would be store.getAllKeys(), but it isn't supported by Edge or Safari.
    // And openKeyCursor isn't supported by Safari.
    // tx.oncomplete = () => done(null, keys)
  }
  return api
}

},{}],5:[function(require,module,exports){
module.exports = {
  type: 'github',
  parser: require('./parser'),
  resolver: require('./resolver'),
  match: /^(https?:\/\/)?(www.)?github.com\/([^/]*\/[^/]*)\/(.*)/
};
},{"./parser":6,"./resolver":7}],6:[function(require,module,exports){
const replaceContent = require('solc-import').replaceContent;
const resolver = require('./resolver');
// https://github.com/<owner>/<repo>/<path_to_the_file>

module.exports = async function (importPath) {
  const [, , , root, path] = require('./index').match.exec(importPath);

  const url = `https://raw.githubusercontent.com/${root}/master/${path}`;
  try {
    const response = await fetch(url, { method: 'GET' });
    let data = await response.text();
    if (!response.ok || response.status !== 200) throw Error('Content ' + data);
    data = replaceContent(data, importPath, resolver);
    return data;
  } catch (error) {
    throw error;
  }
};


// async function getSource(importPath, root, path) {
//   const url = `https://api.github.com/repos/${root}/contents/${path}`;
//   // console.log('url:', url);
//   try {
//     const response = await fetch(url, { method: 'GET' });
//     let data = await response.text();
//     if (!response.ok || response.status !== 200) throw Error(data);
//     data = JSON.parse(data);
//     data.content = window.atob(data.content);
//     data.content = replaceContent(data.content, importPath, pathResolve);
//     if ('content' in data) return data.content;
//     if ('message' in data) throw Error(data.message);
//     throw Error('Content not received');
//   } catch (error) {
//     // Unknown transport error
//     throw error;
//   }
// }
},{"./index":5,"./resolver":7,"solc-import":20}],7:[function(require,module,exports){
module.exports = function (content, from, subImportPath) {
  let newContent = content;
  let url = new window.URL(subImportPath, from);
  let fixedPath = url.href;
  newContent = newContent.replace(`import '${subImportPath}'`, `import '${fixedPath}'`);
  newContent = newContent.replace(`import "${subImportPath}"`, `import "${fixedPath}"`);
  return newContent;
};
},{}],8:[function(require,module,exports){
module.exports = {
  type: 'http',
  parser: require('./parser'),
  resolver: require('./resolver'),
  match: /^(http|https?:\/\/?(.*))$/
};

// const match = /^(http?:\/\/?(.*))$/;
},{"./parser":9,"./resolver":10}],9:[function(require,module,exports){
module.exports = async function (importPath) {
  const [, url,] = require('./index').match.exec(importPath);
  try {
    const response = await fetch(url, { method: 'GET' });
    const data = await response.text();
    if (!response.ok || response.status !== 200) throw Error('Content ' + data);
    return data;
  } catch (error) {
    throw error;
  }
};
},{"./index":8}],10:[function(require,module,exports){
arguments[4][7][0].apply(exports,arguments)
},{"dup":7}],11:[function(require,module,exports){
module.exports = {
  type: 'ipfs',
  parser: require('./parser'),
  resolver: require('./resolver'),
  match: /^(ipfs:\/\/?.+)/
};
},{"./parser":12,"./resolver":13}],12:[function(require,module,exports){
module.exports = async function (importPath) {
  let [, url] = require('./index').match.exec(importPath);
  // replace ipfs:// with /ipfs/
  url = url.replace(/^ipfs:\/\/?/, 'ipfs/');
  url = 'https://gateway.ipfs.io/' + url;

  try {
    const response = await fetch(url, { method: 'GET' });
    const data = await response.text();
    if (!response.ok || response.status !== 200) throw Error(data);
    return data;
  } catch (error) {
    throw error;
  }
};
},{"./index":11}],13:[function(require,module,exports){
arguments[4][7][0].apply(exports,arguments)
},{"dup":7}],14:[function(require,module,exports){
module.exports = {
  type: 'swarm',
  parser: require('./parser'),
  resolver: require('./resolver'),
  match: /^(bzz[ri]?:\/\/?(.*))$/
};
},{"./parser":15,"./resolver":16}],15:[function(require,module,exports){
module.exports = async function (importPath) {
  const [, url,] = require('./index').match.exec(importPath);
  try {
    let content = await swarmgw.get(url);
    return content;
  } catch (error) {
    throw error;
  }
};

const swarmgw = swarmgwMaker();


async function getFile(gateway, url) {
  const httpsURL = gateway + '/' + url;
  try {
    const response = await fetch(httpsURL, { method: 'GET' });
    const data = await response.text();
    if (!response.ok || response.status !== 200) throw Error(data);
    return data;
  } catch (error) {
    throw error;
  }
}

function swarmgwMaker(opts) {
  opts = opts || {};
  var gateway;
  if (opts.gateway) {
    gateway = opts.gateway;
  } else if (opts.mode === 'http') {
    gateway = 'http://swarm-gateways.net';
  } else {
    gateway = 'https://swarm-gateways.net';
  }
  return {
    get: async function (url) {
      return await getFile(gateway, url);
    }
  };
}

},{"./index":14}],16:[function(require,module,exports){
arguments[4][7][0].apply(exports,arguments)
},{"dup":7}],17:[function(require,module,exports){
const getImports = require('./getImports');
const isExistImport = require('./isExistImport');

module.exports = combineSource;

async function combineSource(source, getImportContent) {
  try {
    const allImportPath = getImports(source);
    let allSubImportPath = [];
    let sourceMap = new Map();

    for (let importPath of allImportPath) {
      let content = await getImportContent(importPath);
      allSubImportPath = allSubImportPath.concat(getImports(content));
      sourceMap.set(importPath, content);
    }

    sourceMap = await getMergeSubImportMap(allSubImportPath, sourceMap, getImportContent);

    let sources = [];
    for (let [key, value] of sourceMap) {
      sources.push({ path: key, content: value });
    }
    return sources;
  } catch (error) {
    throw(error);
  }
}

async function getMergeSubImportMap(allSubImportPath, sourceMap, getImportContent) {
  if (allSubImportPath.length != 0) {
    let search = true;
    let nextAllSubImportPath = [];
    while (search) {
      for (let subImportPath of allSubImportPath) {
        if (sourceMap.has(subImportPath)) break;
        let content = await getImportContent(subImportPath);
        sourceMap.set(subImportPath, content);
        if (isExistImport(content)) {
          let sub2ImportPath = getImports(content);
          nextAllSubImportPath = nextAllSubImportPath.concat(sub2ImportPath);
        }
      }
      search = nextAllSubImportPath.length != 0;
      allSubImportPath = nextAllSubImportPath;
      nextAllSubImportPath = [];
    }
  }
  return sourceMap;
}
},{"./getImports":18,"./isExistImport":21}],18:[function(require,module,exports){
module.exports = getImports;

function getImports(source) {
  let matches = [];
  let ir = /^(.*import){1}(.+){0,1}\s['"](.+)['"];/gm;
  let match = null;
  while ((match = ir.exec(source))) {
    matches.push(match[3]);
  }
  return matches;
}
},{}],19:[function(require,module,exports){
const combineSource = require('./combineSource');

module.exports = getReadCallback;

async function getReadCallback(sourceCode, getImportContent) {
  let sources = await combineSource(sourceCode, getImportContent);

  // import: it must be sync function
  function readCallback(path) {
    for (let source of sources) {
      if (source.path == path) {
        return { contents: source.content }; 
      } 
    }
  }
  return readCallback;
}
},{"./combineSource":17}],20:[function(require,module,exports){
module.exports = {
  combineSource: require('./combineSource'),
  getImports: require('./getImports'),
  getReadCallback: require('./getReadCallback'),
  isExistImport: require('./isExistImport'),
  replaceContent: require('./replaceContent')
};
},{"./combineSource":17,"./getImports":18,"./getReadCallback":19,"./isExistImport":21,"./replaceContent":22}],21:[function(require,module,exports){
const getImports = require('./getImports');

module.exports = isExistImport;

function isExistImport(sourcecode) {
  const allImportPath = getImports(sourcecode);
  return allImportPath.length != 0;
}
},{"./getImports":18}],22:[function(require,module,exports){
const getImports = require('./getImports');
const isExistImport = require('./isExistImport');

module.exports = replaceContent;

function replaceContent(content, from, resolver) {
  let newContent = content;
  if (isExistImport(content)) {
    const allSubImportPath = getImports(content);
    for (let subImportPath of allSubImportPath) {
      if (isExplicitlyRelative(subImportPath)) {
        newContent = resolver(newContent, from, subImportPath);
      }
    }
  }
  return newContent;
}

function isExplicitlyRelative(importPath) {
  return importPath.indexOf('.') === 0;
}
},{"./getImports":18,"./isExistImport":21}],23:[function(require,module,exports){
const baseURL = 'https://solc-bin.ethereum.org/bin';

const ajaxCaching = require('ajax-caching');
const promiseAjax = ajaxCaching.promiseAjax;

module.exports = getlist;

async function getlist() {
  try {
    const opts = {
      url: `${baseURL}/list.json`,
      caching: true,
      transform: function (data) {
        if (data.releases) throw Error('get list fail');
        return data;
      }
    };
    return await promiseAjax(opts);
  } catch (error) {
    throw error;
  }
}
},{"ajax-caching":2}],24:[function(require,module,exports){
module.exports = groupByVersion;

function removeAllZeroPointFiveVersion(select) {
  select.nightly = select.nightly.filter(x => !~x.indexOf('v0.5.'));
  select.all = select.all.filter(x => !~x.indexOf('v0.5.'));
  select.releases = select.releases.filter(x => !~x.indexOf('v0.5.'));
}

function groupByVersion(data, skip5 = true) {
  const { releases, nightly, all } = data;
  let select = {};
  select.nightly = Object.keys(nightly).reverse();
  select.all = Object.keys(all).reverse();
  select.releases = Object.keys(releases).reverse();
  if (skip5) removeAllZeroPointFiveVersion(select);
  return select;
}
},{}],25:[function(require,module,exports){
module.exports = {
  version2url: require('./version2url'),
  versions: require('./versions'),
  versionsSkipVersion5: require('./versionsSkipVersion5')
};
},{"./version2url":27,"./versions":28,"./versionsSkipVersion5":29}],26:[function(require,module,exports){
module.exports = processList;

function processList(json) {
  const data = JSON.parse(json);
  const lists = Object.values(data.builds).reduce(({ agg, d }, x, i, arr) => {
    const { path, prerelease, version } = x;
    if (prerelease) {
      d = prerelease.split('nightly.')[1];
      var [year0, month0, day0] = d.split('.').map(Number);
      if ((month0 + '').length < 2) month0 = '0' + month0;
      if ((day0 + '').length < 2) day0 = '0' + day0;
      d = [year0, month0, day0].join('.');
      const entry = [`v${version}-nightly-${d}`, path];
      agg.nightly.push(entry);
      agg.all.push(entry);
    } else {
      for (var j = i + 1, ahead; j < arr.length && !(ahead = arr[j].prerelease); j++) { }
      if (ahead) ahead = ahead.split('nightly.')[1];
      else ahead = d;
      if (!d) d = ahead;
      if (ahead !== d) {
        var [year1, month1, day1] = d.split('.').map(Number);
        var [year2, month2, day2] = ahead.split('.').map(Number);
        var d1 = new Date(year1, month1 - 1, day1);
        var d2 = new Date(year2, month2 - 1, day2);
        var diffDays = parseInt((d2 - d1) / (1000 * 60 * 60 * 24));
        var d3 = new Date(d1);
        d3.setDate(d3.getDate() + diffDays / 2);
        var month = d3.getUTCMonth() + 1;
        var day = d3.getDate();
        var year = d3.getUTCFullYear();
        var current = [year, month, day].join('.');
      } else {
        var current = ahead;
      }
      var [year0, month0, day0] = current.split('.').map(Number);
      if ((month0 + '').length < 2) month0 = '0' + month0;
      if ((day0 + '').length < 2) day0 = '0' + day0;
      current = [year0, month0, day0].join('.');
      const entry = [`v${version}-stable-${current}`, path];
      agg.releases.push(entry);
      agg.all.push(entry);
    }
    return { agg, d };
  }, { agg: { releases: [], nightly: [], all: [] }, d: null }).agg;
  const { releases, nightly, all } = lists;
  lists.releases = releases.reduce((o, x) => ((o[x[0]] = x[1]), o), {});
  lists.nightly = nightly.reduce((o, x) => ((o[x[0]] = x[1]), o), {});
  lists.all = all.reduce((o, x) => ((o[x[0]] = x[1]), o), {});
  return lists;
}
},{}],27:[function(require,module,exports){
const baseURL = 'https://solc-bin.ethereum.org/bin';

const processList = require('./processList');
const getlist = require('./getlist');

module.exports = version2url;

function version2url(version, list) {
  return new Promise(async (resolve, reject) => {
    try {
      let data = list ? list : await getlist();
      let select = processList(data);
      const { all, releases } = select;
      if (version === 'latest') version = Object.keys(releases)[0];
      if (version === 'nightly') version = Object.keys(all)[0];
      var path = all[version];
      if (!path) return reject(new Error(`unknown version: ${version}`));
      resolve(`${baseURL}/${path}`);
    } catch (error) {
      reject(error);
    }
  });
}
},{"./getlist":23,"./processList":26}],28:[function(require,module,exports){
const processList = require('./processList');
const getlist = require('./getlist');
const groupByVersion = require('./groupByVersion');

module.exports = versions;

function versions(list) {
  return new Promise(async (resolve, reject) => {
    try {
      let data = list ? list : await getlist();
      let select = groupByVersion(processList(data), false);
      resolve(select);
    } catch (error) {
      reject(error);
    }
  });
}
},{"./getlist":23,"./groupByVersion":24,"./processList":26}],29:[function(require,module,exports){
const processList = require('./processList');
const getlist = require('./getlist');
const groupByVersion = require('./groupByVersion');

module.exports = versionsSkipVersion5;

function versionsSkipVersion5() {
  return new Promise(async (resolve, reject) => {
    try {
      let data = await getlist();
      let select = groupByVersion(processList(data), true);
      resolve(select);
    } catch (error) {
      reject(error);
    }
  });
}
},{"./getlist":23,"./groupByVersion":24,"./processList":26}],30:[function(require,module,exports){
const solcImport = require('solc-import');
const solcResolver = require('solc-resolver');
const solcjsCore = require('solcjs-core');

module.exports = getCompile;

function getCompile(oldSolc) {
  let compile;
  Object.keys(oldSolc).forEach(key => {
    if (key != 'compile') return;

    compile = async function (sourcecode = '', getImportContent) {
      if (solcImport.isExistImport(sourcecode)) {
        if (getImportContent == undefined) {
          getImportContent = getContent();
        } else if (typeof getImportContent !== 'function') {
          throw Error('getContent should be a funcion.');
        }
      }

      let readCallback = await solcjsCore.getReadCallback(
        sourcecode,
        getImportContent
      );
      return solcjsCore.wrapperCompile(oldSolc, sourcecode, readCallback);
    };
  });
  return compile;
}

function getContent() {
  const ResolverEngine = require('solc-resolver').resolverEngine;
  let resolverEngine = new ResolverEngine();

  let resolveGithub = require('resolve-github');
  resolverEngine.addResolver(resolveGithub);

  let resolveHttp = require('resolve-http');
  resolverEngine.addResolver(resolveHttp);

  let resolveIPFS = require('resolve-ipfs');
  resolverEngine.addResolver(resolveIPFS);

  let resolveSwarm = require('resolve-swarm');
  resolverEngine.addResolver(resolveSwarm);

  const getImportContent = async function (path) {
    return await resolverEngine.require(path);
  };

  return getImportContent;
}

},{"resolve-github":5,"resolve-http":8,"resolve-ipfs":11,"resolve-swarm":14,"solc-import":20,"solc-resolver":33,"solcjs-core":53}],31:[function(require,module,exports){

let solcjs = require('./solc');
const solcVersion = require('solc-version');

module.exports = solcjs;

solcjs.versions = solcVersion.versions;
solcjs.versionsSkipVersion5 = solcVersion.versionsSkipVersion5;
solcjs.version2url = solcVersion.version2url;
},{"./solc":32,"solc-version":25}],32:[function(require,module,exports){
const solcVersion = require('solc-version');
const getCompile = require('./getCompile');
const solcjsCore = require('solcjs-core');
const solcWrapper = solcjsCore.solcWrapper.wrapper;

function solcjs(_version) {
  return new Promise(async (resolve, reject) => {
    let newCompile;
    let version;

    try {
      version = await solcjsCore.getVersion(_version);
      
      console.time('[fetch compiler]');
      let url = await solcVersion.version2url(version);
      let compilersource = await solcjsCore.getCompilersource(url);
      console.timeEnd('[fetch compiler]');

      console.time('[load compiler]');
      const solc = solcjsCore.loadModule(compilersource);
      console.timeEnd('[load compiler]');

      console.time('[wrap compiler]');
      let _compiler = solcWrapper(solc);
      _compiler.opts = { version, url };

      newCompile = getCompile(_compiler);
      newCompile.version = { name: version, url };
      console.timeEnd('[wrap compiler]');

      try {
        await solcjsCore.pretest(newCompile, version);
        resolve(newCompile);
      } catch (err) { throw new Error('pretest failed'); }
    } catch (error) {
      console.error(error);
      reject(error);
    }
  });
}

module.exports = solcjs;
},{"./getCompile":30,"solc-version":25,"solcjs-core":53}],33:[function(require,module,exports){
module.exports = {
  resolverEngine: require('./resolverEngine')
};
},{"./resolverEngine":34}],34:[function(require,module,exports){
module.exports = class ResolverEngine {
  constructor() {
    this.resolvers = [];
    this.previouslyHandled = {};
  }

  async getContent(url) {
    for (let resolve of this.resolvers) {
      if (this.getResolverType(url) == resolve.type) {
        const result = await resolve.parser(url);
        if (result) return result;
      }
    }
    return;
  }

  // get data
  async require(importPath) {
    const imported = this.previouslyHandled[importPath];
    // get source from cache
    if (imported) {
      let result = this.getResultFromImported(imported, importPath);
      return result.content;
    }

    const handlerType = this.getResolverType(importPath);
    const content = await this.getContent(importPath);

    this.previouslyHandled[importPath] = {
      content: content,
      type: handlerType,
      importPath
    };

    return content;
  }

  // chain pattern
  addResolver(resolver) {
    this.resolvers.push(resolver);
    return this;
  }

  getResultFromImported(imported, importPath) {
    return {
      content: imported.content,
      type: imported.type,
      importPath
    };
  }

  getResolverType(url) {
    for (let resolver of this.resolvers) {
      let match = resolver.match.exec(url);
      if (match) {
        return resolver.type;
      }
    }
    return;
  }

  isMatch(importPath) {
    let found = false;
    if (this.resolvers.length == 0) return false;
    for (let resolver of this.resolvers) {
      if (found) break;
      const match = resolver.match.exec(importPath);
      if (match) found = true;
    }
    return !found;
  }
};
},{}],35:[function(require,module,exports){
arguments[4][17][0].apply(exports,arguments)
},{"./getImports":36,"./isExistImport":39,"dup":17}],36:[function(require,module,exports){
arguments[4][18][0].apply(exports,arguments)
},{"dup":18}],37:[function(require,module,exports){
arguments[4][19][0].apply(exports,arguments)
},{"./combineSource":35,"dup":19}],38:[function(require,module,exports){
module.exports = {
  combineSource: require('./combineSource'),
  getImports: require('./getImports'),
  getReadCallback: require('./getReadCallback'),
  isExistImport: require('./isExistImport')
};
},{"./combineSource":35,"./getImports":36,"./getReadCallback":37,"./isExistImport":39}],39:[function(require,module,exports){
arguments[4][21][0].apply(exports,arguments)
},{"./getImports":36,"dup":21}],40:[function(require,module,exports){
arguments[4][23][0].apply(exports,arguments)
},{"ajax-caching":2,"dup":23}],41:[function(require,module,exports){
arguments[4][24][0].apply(exports,arguments)
},{"dup":24}],42:[function(require,module,exports){
arguments[4][25][0].apply(exports,arguments)
},{"./version2url":44,"./versions":45,"./versionsSkipVersion5":46,"dup":25}],43:[function(require,module,exports){
arguments[4][26][0].apply(exports,arguments)
},{"dup":26}],44:[function(require,module,exports){
arguments[4][27][0].apply(exports,arguments)
},{"./getlist":40,"./processList":43,"dup":27}],45:[function(require,module,exports){
arguments[4][28][0].apply(exports,arguments)
},{"./getlist":40,"./groupByVersion":41,"./processList":43,"dup":28}],46:[function(require,module,exports){
arguments[4][29][0].apply(exports,arguments)
},{"./getlist":40,"./groupByVersion":41,"./processList":43,"dup":29}],47:[function(require,module,exports){
const solcImport = require('solc-import');
const getReadCallback = require('./getReadCallback');
const wrapperCompile = require('./wrapperCompile');

module.exports = getCompile;

function getCompile(oldSolc) {
  let compile;
  Object.keys(oldSolc).forEach(key => {
    if (key != 'compile') return;

    compile = async function (sourcecode = '', getImportContent) {
      if (solcImport.isExistImport(sourcecode)) {
        if (getImportContent == undefined) throw Error('you should pass getImportContent function in the second pararmeter.');
      }

      let readCallback = await getReadCallback(
        sourcecode,
        getImportContent
      );
      return wrapperCompile(oldSolc, sourcecode, readCallback);
    };
  });
  return compile;
}

},{"./getReadCallback":50,"./wrapperCompile":65,"solc-import":38}],48:[function(require,module,exports){
const solcImport = require('solc-import');

module.exports = getCompileOutput;

function getCompileOutput(oldSolc, sourcecode, readCallback) {
  let output;
  if (solcImport.isExistImport(sourcecode)) {
    // this is wrapper.compile
    output = oldSolc.compile(sourcecode, 1, readCallback);
  } else {
    output = oldSolc.compile(sourcecode, 1);
  }
  return output;
}
},{"solc-import":38}],49:[function(require,module,exports){
const ajaxCaching = require('ajax-caching');
const promiseAjax = ajaxCaching.promiseAjax;

module.exports = getCompilersource;

async function getCompilersource(compilerURL) {
  try {
    const opts = {
      url: compilerURL,
      caching: true,
      transform: function (data) {
        if (data.substring(0, 10) != 'var Module') {
          throw Error('get compiler source fail');
        }
        return data;
      }
    };
    return await promiseAjax(opts);
  } catch (error) {
    throw error;
  }
}
},{"ajax-caching":2}],50:[function(require,module,exports){
const solcImport = require('solc-import');

module.exports = getReadCallback;

async function getReadCallback(sourcecode, getImportContent) {
  if (!solcImport.isExistImport(sourcecode)) return;
  return await solcImport.getReadCallback(sourcecode, getImportContent);
}
},{"solc-import":38}],51:[function(require,module,exports){
module.exports = getStandardError;

function getStandardError(errors) {
  let result = [];
  for (let error of errors) {
    result.push({
      component: error.component,
      formattedMessage: error.formattedMessage,
      message: error.message,
      type: error.type
    });
  }
  return result;
}
},{}],52:[function(require,module,exports){
const solcVersion = require('solc-version');

module.exports = getVersion;

async function getVersion(_version) {
  if (typeof _version == 'string' && _version.length < 30) return _version;
  let select;
  if (_version == undefined) {
    select = await solcVersion.versions();
  } else if (typeof _version == 'string') {
    select = await solcVersion.versions(_version);
  } else {
    throw Error('unknow getVersion error');
  }
  return select.releases[0];
}
},{"solc-version":42}],53:[function(require,module,exports){
module.exports = {
  getCompilersource: require('./getCompilersource'),
  getReadCallback: require('./getReadCallback'),
  getVersion: require('./getVersion'),
  loadModule: require('./loadModule'),
  pretest: require('./pretest'),
  wrapperCompile: require('./wrapperCompile'),
  getCompile: require('./getCompile'),
  solc: require('./solc'),
  solcWrapper: require('./solc-wrapper')
};
},{"./getCompile":47,"./getCompilersource":49,"./getReadCallback":50,"./getVersion":52,"./loadModule":54,"./pretest":55,"./solc":64,"./solc-wrapper":57,"./wrapperCompile":65}],54:[function(require,module,exports){
module.exports = loadModule;

// HELPER
function loadModule(sourcecode) {
  let script = window.document.createElement('script');
  let exists = true;
  if (!('Module' in window)) {
    exists = false;
    window.Module = {};
  }
  script.text = `window.Module=((Module)=>{${sourcecode};return Module})()`;
  window.document.head.appendChild(script);
  window.document.head.removeChild(script);
  const compiler = window.Module;
  if (!exists) delete window.Module;
  return compiler;
}

// function loadModule(sourcecode) {
//   let script = window.document.createElement('script');
//   let oldModule, exists;
//   if ('Module' in window) {
//     oldModule = window.Module;
//     exists = true;
//   } else {
//     window.Module = {};
//   }
//   script.text = `window.Module=((Module)=>{${sourcecode};return Module})()`;
//   window.document.head.appendChild(script);
//   window.document.head.removeChild(script);
//   const compiler = window.Module;
//   if (exists) {
//     window.Module = oldModule;
//   } else {
//     delete window.Module;
//   }
//   return compiler;
// }
},{}],55:[function(require,module,exports){
module.exports = pretest;

async function pretest(compile) {
  try {
    let content = `
    contract NewContract {
      function f() public {}
    }`;
    await compile(content);
  } catch (error) {
    console.error('pretest failed');
    throw error;
  }
}
},{}],56:[function(require,module,exports){
// from: sindresorhus/semver-regex
var semverRegex = /\bv?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[\da-z-]+(?:\.[\da-z-]+)*)?(?:\+[\da-z-]+(?:\.[\da-z-]+)*)?\b/ig;

// from: substack/semver-compare
function cmp (a, b) {
  var pa = a.split('.'), pb = b.split('.');
  for (var i = 0; i < 3; i++) {
    var na = Number(pa[i]), nb = Number(pb[i]);
    if (na > nb) return 1;
    if (nb > na) return -1;
    if (!isNaN(na) && isNaN(nb)) return 1;
    if (isNaN(na) && !isNaN(nb)) return -1;
  }
  return 0;
}

// semver.lt('1.2.3', '9.8.7') // true
var semver = {
  lt(a, b) { 
    var A = a.match(semverRegex), B = b.match(semverRegex);
    if (A && A.length === 1 && B && B.length === 1) {
      return cmp(A[0], B[0]) === -1;
    }
  }
};

function update (compilerVersion, abi) {
  var hasConstructor = false;
  var hasFallback = false;

  for (var i = 0; i < abi.length; i++) {
    var item = abi[i];

    if (item.type === 'constructor') {
      hasConstructor = true;

      // <0.4.5 assumed every constructor to be payable
      if (semver.lt(compilerVersion, '0.4.5')) {
        item.payable = true;
      }
    } else if (item.type === 'fallback') {
      hasFallback = true;
    }

    if (item.type !== 'event') {
      // add 'payable' to everything
      if (semver.lt(compilerVersion, '0.4.0')) {
        item.payable = true;
      }

      // add stateMutability field
      if (semver.lt(compilerVersion, '0.4.16')) {
        if (item.payable) {
          item.stateMutability = 'payable';
        } else if (item.constant) {
          item.stateMutability = 'view';
        } else {
          item.stateMutability = 'nonpayable';
        }
      }
    }
  }

  // 0.1.2 from Aug 2015 had it. The code has it since May 2015 (e7931ade)
  if (!hasConstructor && semver.lt(compilerVersion, '0.1.2')) {
    abi.push({
      type: 'constructor',
      payable: true,
      stateMutability: 'payable',
      inputs: []
    });
  }

  if (!hasFallback && semver.lt(compilerVersion, '0.4.0')) {
    abi.push({
      type: 'fallback',
      payable: true,
      stateMutability: 'payable'
    });
  }

  return abi;
}

module.exports = {
  update: update
};

},{}],57:[function(require,module,exports){
module.exports = {
  linker: require('./linker'),
  wrapper: require('./wrapper'),
  abi: require('./abi'),
  translate: require('./translate')
};
},{"./abi":56,"./linker":58,"./translate":59,"./wrapper":63}],58:[function(require,module,exports){
module.exports = { linkBytecode, findLinkReferences };

function linkBytecode (bytecode, libraries) {
  // NOTE: for backwards compatibility support old compiler which didn't use file names
  var librariesComplete = {};
  for (var libraryName in libraries) {
    if (typeof libraries[libraryName] === 'object') {
      for (var lib in libraries[libraryName]) { // API compatible with the standard JSON i/o
        librariesComplete[lib] = libraries[libraryName][lib];
        librariesComplete[libraryName + ':' + lib] = libraries[libraryName][lib];
      }
    } else {
      // backwards compatible API for early solc-js verisons
      var parsed = libraryName.match(/^([^:]*):?(.*)$/);
      if (parsed) librariesComplete[parsed[2]] = libraries[libraryName];
      librariesComplete[libraryName] = libraries[libraryName];
    }
  }
  for (libraryName in librariesComplete) {
    var internalName = libraryName.slice(0, 36);
    // truncate to 37 characters
    // prefix and suffix with __
    var libLabel = '__' + internalName + Array(37 - internalName.length).join('_') + '__';
    var hexAddress = librariesComplete[libraryName];
    if (hexAddress.slice(0, 2) !== '0x' || hexAddress.length > 42) {
      throw new Error('Invalid address specified for ' + libraryName);
    }
    hexAddress = hexAddress.slice(2);
    // remove 0x prefix
    hexAddress = Array(40 - hexAddress.length + 1).join('0') + hexAddress;
    while (bytecode.indexOf(libLabel) >= 0) {
      bytecode = bytecode.replace(libLabel, hexAddress);
    }
  }
  return bytecode;
}

function findLinkReferences (bytecode) {
  // find 40 bytes in the pattern of __...<36 digits>...__
  // e.g. __Lib.sol:L_____________________________
  var linkReferences = {};
  var offset = 0;
  while (true) {
    var found = bytecode.match(/__(.{36})__/);
    if (!found) {
      break;
    }

    var start = found.index;
    // trim trailing underscores
    // NOTE: this has no way of knowing if the trailing underscore was part of the name
    var libraryName = found[1].replace(/_+$/gm, '');
    if (!linkReferences[libraryName]) linkReferences[libraryName] = [];

    linkReferences[libraryName].push({
      // offsets are in bytes in binary representation (and not hex)
      start: (offset + start) / 2,
      length: 20
    });

    offset += start + 20;
    bytecode = bytecode.slice(start + 20);
  }
  return linkReferences;
}

},{}],59:[function(require,module,exports){
module.exports = {
  standardTranslateJsonCompilerOutput: require('./standardTranslateJsonCompilerOutput'),
  prettyPrintLegacyAssemblyJSON: require('./prettyPrintLegacyAssemblyJSON'),
  versionToSemver: require('./versionToSemver')
};
},{"./prettyPrintLegacyAssemblyJSON":60,"./standardTranslateJsonCompilerOutput":61,"./versionToSemver":62}],60:[function(require,module,exports){
module.exports = prettyPrintLegacyAssemblyJSON;

function prettyPrintLegacyAssemblyJSON(assembly, source) {
  return formatAssemblyText(assembly, '', source);
}

function formatAssemblyText(asm, prefix, source) {
  if (typeof asm === typeof '' || asm === null || asm === undefined) {
    return prefix + (asm || '') + '\n';
  }
  var text = prefix + '.code\n';
  asm['.code'].forEach(function (item, i) {
    var v = item.value === undefined ? '' : item.value;
    var src = '';
    if (source !== undefined && item.begin !== undefined && item.end !== undefined) {
      src = escapeString(source.slice(item.begin, item.end));
    }
    if (src.length > 30) {
      src = src.slice(0, 30) + '...';
    }
    if (item.name !== 'tag') {
      text += '  ';
    }
    text += prefix + item.name + ' ' + v + '\t\t\t' + src + '\n';
  });
  text += prefix + '.data\n';
  var asmData = asm['.data'] || [];
  for (var i in asmData) {
    var item = asmData[i];
    text += '  ' + prefix + '' + i + ':\n';
    text += formatAssemblyText(item, prefix + '    ', source);
  }
  return text;
}

function escapeString(text) {
  return text
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}
},{}],61:[function(require,module,exports){
// https://solidity.readthedocs.io/en/v0.5.1/using-the-compiler.html?highlight=legacyAST#output-description

module.exports = standardTranslateJsonCompilerOutput;

// function writeOutput(data, version) {
//   const fileName = version.split('-')[0];
//   const jsonfile = require('jsonfile');
//   jsonfile.writeFile(`./test/wrapper/translate/output/${fileName}.json`, data, function (err) {
//     if (err) console.error(err);
//   });
// }

function standardTranslateJsonCompilerOutput({ version, url }, data) {
  if (isMatchVersion(version, '0.1')) throw Error('don\'t support v0.1.x version.');

  try {
    // writeOutput(data, version);
    let output = Object.keys(data.contracts).map(name => {
      let contract = data.contracts[name];
      var {
        functionHashes,
      } = contract;

      const metadata = getMetadata(contract, name, version);

      var compilation = {
        name: getName(contract, name, version),
        abi: getABI(contract, name, version),
        sources: getSource(data, metadata, version, name),
        compiler: getCompile(metadata, version, url, name),
        assembly: {
          assembly: getAssembly(contract, name, version),
          opcodes: getOpcodes(contract)
        },
        binary: {
          bytecodes: {
            bytecode: getBytecode(contract, name, version),
            runtimeBytecode: getRuntimeBytecode(contract, name, version)
          },
          sourcemap: {
            srcmap: getSrcmap(contract, version),
            srcmapRuntime: getSrcmapRuntime(contract, version)
          },
        },
        metadata: {
          ast: getAST(name, data, version),
          devdoc: getDevDoc(contract, metadata, version),
          userdoc: getUserDoc(contract, metadata, version),
          functionHashes,
          gasEstimates: getGasEstimates(contract, name, version),
          analysis: (() => {
            return getAnalysis(data.errors);
          })()
        }
      };
      // console.log('=== stardard output ====');
      // console.log(compilation);
      return compilation;
    });
    return output;
  } catch (error) {
    console.error(error);
    console.error('[ERROR] parse standard output error');
    throw error;
  }
}

function isNewVersion(version) {
  return isMatchVersion(version, '0.5', '0.4');
}

function getName(contract, name, version) {
  return isNewVersion(version) ? Object.keys(contract)[0] : name;
}

function getAnalysis(errors) {
  let result = { warnings: [], others: [] };
  for (let error in errors) {
    let errItem = errors[error];
    let type;
    if (errItem.type) {
      type = errItem.type.trim().toLowerCase();
    } else {
      type = errItem.split(':')[3];
    }
    if (type == 'warning') type = 'warnings';
    (result[type] || (result[type] = [])).push(errItem);
  }
  return result;
}

function getSrcmap(contract, version) {
  try {
    if (isMatchVersion(version, '0.5')) {
      let name = Object.keys(contract)[0];
      return contract[name].evm.bytecode.sourceMap;
    } else if (isMatchVersion(version, '0.4', '0.3')) {
      return contract.srcmap;
    } else {
      return;
    }
  } catch (error) {
    console.error('[ERROR] parse srcmap fail');
    throw error;
  }
}

function getBytecode(contract, name, version) {
  if (isNewVersion(version)) {
    let name2 = Object.keys(contract)[0];
    return contract[name2].evm.bytecode.object;
  } else {
    return contract.bytecode;
  }
}

function getRuntimeBytecode(contract, name, version) {
  if (isNewVersion(version)) {
    let name2 = Object.keys(contract)[0];
    return contract[name2].evm.deployedBytecode.object;
  } else {
    return contract.runtimeBytecode;
  }
}

function getSrcmapRuntime(contract, version) {
  try {
    if (isMatchVersion(version, '0.5')) {
      let name = Object.keys(contract)[0];
      return contract[name].evm.bytecode.sourceMap;
    } else if (isMatchVersion(version, '0.4')) {
      return contract.srcmapRuntime;
    } else if (isMatchVersion(version, '0.3')) {
      return contract['srcmap-runtime'];
    } else {
      return;
    }
  } catch (error) {
    console.error('[ERROR] parse bytecode fail');
    throw error;
  }
}

function getOpcodes(contract) {
  if (contract.opcodes) {
    return contract.opcodes;
  } else {
    let name = Object.keys(contract)[0];
    return contract[name].evm.bytecode.opcodes;
  }
}

function getAssembly(contract, name, version) {
  if (isNewVersion(version)) {
    let name = Object.keys(contract)[0];
    return contract[name].evm.legacyAssembly;
  } else {
    return contract.assembly;
  }
}

function getGasEstimates(contract, name, version) {
  if (isNewVersion(version)) {
    let name = Object.keys(contract)[0];
    return contract[name].evm.gasEstimates;
  } else {
    return contract.gasEstimates;
  }
}

function getAST(name, data, version) {
  return isNewVersion(version) ? data.sources[name].ast : data.sources[''].AST;
}

function getUserDoc(contract, metadata, version) {
  try {
    if (isMatchVersion(version, '0.5')) {
      let name = Object.keys(contract)[0];
      return contract[name].userdoc;
    } else if (isMatchVersion(version, '0.4')) {
      return metadata.output.userdoc;
    } else {
      return;
    }
  } catch (error) {
    console.error('[ERROR] parse userdoc fail');
    throw error;
  }
}

function getDevDoc(contract, metadata, version) {
  if (isMatchVersion(version, '0.5')) {
    let name = Object.keys(contract)[0];
    return contract[name].devdoc;
  } else if (isMatchVersion(version, '0.4')) {
    return metadata.output.devdoc;
  } else {
    return;
  }
}

function getABI(contract, name, version) {
  if (isNewVersion(version)) {
    let name2 = Object.keys(contract)[0];
    return contract[name2].abi;
  } else {
    return JSON.parse(contract.interface);
  }
}

function getMetadata(contract, name, version) {
  if (isNewVersion(version)) {
    let name2 = Object.keys(contract)[0];
    // let { metadata, abi, evm } 
    let { metadata } = contract[name2];
    metadata = JSON.parse(metadata);
    // console.log('=== metadata ====');
    // console.log(metadata);
    return metadata;
  } else {
    return;
  }
}

function getCompile(metadata, version, url, name) {
  let language, evmVersion, optimizer, runs;
  if (isNewVersion(version)) {
    language = metadata.language.toLowerCase();
    evmVersion = metadata.settings.evmVersion;
    optimizer = metadata.settings.optimizer.enabled;
    runs = metadata.settings.optimizer.runs;
  } else {
    language = 'solidity';
    // evmVersion = metadata.settings.evmVersion;
    optimizer = true;
    runs = 200;
  }

  return {
    language,
    version: version,
    url,
    evmVersion,
    optimizer,
    runs,
  };
}

function getSource(data, metadata, version, name) {
  let sources = {};

  if (isMatchVersion(version, '0.5', '0.4')) {
    sources = {
      sourcecode: {
        keccak256: getKeccak256(metadata, version, name),
        urls: [] // DONT HAVE
      },
      compilationTarget: (metadata.settings.compilationTarget)[name],
      remappings: metadata.settings.remappings,
      libraries: metadata.settings.libraries,
      sourcelist: undefined
    };
    // } else if (isMatchVersion(version, '0.4')) {
    //   sources = {
    //     sourcecode: metadata.sources[''],
    //     compilationTarget: metadata.settings.compilationTarget[''],
    //     remappings: metadata.settings.remappings,
    //     libraries: metadata.settings.libraries,
    //     sourcelist: data.sourceList
    // };
  } else if (isMatchVersion(version, '0.3')) {
    sources = {
      sourcecode: '',
      compilationTarget: '',
      remappings: '',
      libraries: '',
      sourcelist: data.sourceList
    };
  } else {
    return;
  }
  return sources;
}

function getKeccak256(metadata, version, name) {
  if (isMatchVersion(version, '0.5')) {
    return metadata.sources[name].keccak256;
  } else {
    return metadata.sources[''];
  }
}

function isMatchVersion(version, ...match) {
  for (let m of match) {
    if (version.indexOf(`v${m}.`) != -1) return true;
  }
  return false;
}
},{}],62:[function(require,module,exports){
module.exports = versionToSemver;

/// Translate old style version numbers to semver.
/// Old style: 0.3.6-3fc68da5/Release-Emscripten/clang
///            0.3.5-371690f0/Release-Emscripten/clang/Interpreter
///            0.2.0-e7098958/.-Emscripten/clang/int linked to libethereum-1.1.1-bbb80ab0/.-Emscripten/clang/int
///            0.1.3-0/.-/clang/int linked to libethereum-0.9.92-0/.-/clang/int
///            0.1.2-5c3bfd4b*/.-/clang/int
///            0.1.1-6ff4cd6b/RelWithDebInfo-Emscripten/clang/int
/// New style: 0.4.5+commit.b318366e.Emscripten.clang
function versionToSemver(version) {
  // FIXME: parse more detail, but this is a good start
  var parsed = version.match(/^([0-9]+\.[0-9]+\.[0-9]+)-([0-9a-f]{8})[/*].*$/);
  if (parsed) {
    return parsed[1] + '+commit.' + parsed[2];
  }
  if (version.indexOf('0.1.3-0') !== -1) {
    return '0.1.3';
  }
  // assume it is already semver compatible
  return version;
}
},{}],63:[function(require,module,exports){
const linker = require('./linker.js');
const translate = require('./translate');
let soljson;
const assert = (bool, msg) => { if (!bool) throw new Error(msg); };

module.exports = wrapper;

function wrapCallback(callback) {
  assert(typeof callback === 'function', 'Invalid callback specified.');
  return function (path, contents, error) {
    var result = callback(soljson.Pointer_stringify(path));
    if (typeof result.contents === 'string') copyString(result.contents, contents);
    if (typeof result.error === 'string') copyString(result.error, error);
  };
}

function copyString(str, ptr) {
  var length = soljson.lengthBytesUTF8(str);
  var buffer = soljson._malloc(length + 1);
  soljson.stringToUTF8(str, buffer, length + 1);
  soljson.setValue(ptr, buffer, '*');
}

function runWithReadCallback(readCallback, compile, args) {
  if (readCallback === undefined) {
    readCallback = function (path) {
      return {
        error: 'File import callback not supported'
      };
    };
  }

  // This is to support multiple versions of Emscripten.
  var addFunction = soljson.addFunction || soljson.Runtime.addFunction;
  var removeFunction = soljson.removeFunction || soljson.Runtime.removeFunction;

  var cb = addFunction(wrapCallback(readCallback));
  var output;
  try {
    args.push(cb);
    // console.log('=== cb ====');
    // console.log(cb);
    output = compile.apply(undefined, args);
  } catch (e) {
    removeFunction(cb);
    throw e;
  }
  removeFunction(cb);
  return output;
}

function getCompileJSON() {
  if ('_compileJSON' in soljson) {
    return soljson.cwrap('compileJSON', 'string', ['string', 'number']);
  }
}

// function getCompileJSONMulti() {
//   if ('_compileJSONMulti' in soljson) {
//     return soljson.cwrap('compileJSONMulti', 'string', ['string', 'number']);
//   }
// }

// function getCompileJSONCallback() {
//   if ('_compileJSONCallback' in soljson) {
//     var compileInternal = soljson.cwrap('compileJSONCallback', 'string', ['string', 'number', 'number']);
//     var compileJSONCallback = function (input, optimize, readCallback) {
//       return runWithReadCallback(readCallback, compileInternal, [input, optimize]);
//     };
//     return compileJSONCallback;
//   }
// }

function getCompileStandard() {
  var compileStandard;
  if ('_compileStandard' in soljson) {
    var compileStandardInternal = soljson.cwrap('compileStandard', 'string', ['string', 'number']);
    compileStandard = function (input, readCallback) {
      return runWithReadCallback(readCallback, compileStandardInternal, [input]);
    };
  }
  if ('_solidity_compile' in soljson) {
    var solidityCompile = soljson.cwrap('solidity_compile', 'string', ['string', 'number']);
    compileStandard = function (input, readCallback) {
      return runWithReadCallback(readCallback, solidityCompile, [input]);
    };
  }
  return compileStandard;
}

function getVersion() {
  let version;
  if ('_solidity_version' in soljson) {
    version = soljson.cwrap('solidity_version', 'string', []);
  } else {
    version = soljson.cwrap('version', 'string', []);
  }
  return version;
}

function getLicense() {
  let license;
  if ('_solidity_license' in soljson) {
    license = soljson.cwrap('solidity_license', 'string', []);
  } else if ('_license' in soljson) {
    license = soljson.cwrap('license', 'string', []);
  } else {
    // pre 0.4.14
    license = function () {};
  }
  return license;
}

function getWrapperFormat(sourcecode) {
  let input = {
    language: 'Solidity',
    settings: {
      optimizer: {
        enabled: true
      },
      metadata: {
        useLiteralContent: true
      },
      outputSelection: { '*': { '*': ['*'], '': ['*'] } }
    },
    sources: {
      'MyContract': {
        content: sourcecode
      }
    }
  };
  return input;
}

function wrapper(_soljson) {
  soljson = _soljson;
  var compileJSON = getCompileJSON();
  // var compileJSONMulti = getCompileJSONMulti();
  // var compileJSONCallback = getCompileJSONCallback();
  var compileStandard = getCompileStandard();
  let version = getVersion();

  function compile(input, optimise, readCallback) {
    let result;
    if (compileStandard) {
      result = compileStandardWrapper(input, readCallback);
    } else {
      result = compileJSON(input, optimise);
    }
    return JSON.parse(result);
  }

  function compileStandardWrapper (input, readCallback) {
    let newInput = JSON.stringify(getWrapperFormat(input));
    return compileStandard(newInput, readCallback);
  }

  // function versionToSemver() { return translate.versionToSemver(version()); }
  let license = getLicense();

  return {
    version: version,
    // semver: versionToSemver,
    license: license,
    compile: compile,
    linkBytecode: linker.linkBytecode
  };
}
},{"./linker.js":58,"./translate":59}],64:[function(require,module,exports){
const solcVersion = require('solc-version');
const getCompile = require('./getCompile');
const getVersion = require('./getVersion');
const getCompilersource = require('./getCompilersource');
const loadModule = require('./loadModule');
const pretest = require('./pretest');
const solcWrapper = require('./solc-wrapper/wrapper');

function solcjs(_version) {
  return new Promise(async (resolve, reject) => {
    let newCompile;
    let version;

    try {
      version = await getVersion(_version);
      
      console.time('[fetch compiler]');
      let url = await solcVersion.version2url(version);
      let compilersource = await getCompilersource(url);
      console.timeEnd('[fetch compiler]');

      console.time('[load compiler]');
      const solc = loadModule(compilersource);
      console.timeEnd('[load compiler]');

      console.time('[wrap compiler]');
      let _compiler = solcWrapper(solc);
      _compiler.opts = { version, url };

      newCompile = getCompile(_compiler);
      newCompile.version = { name: version, url };
      console.timeEnd('[wrap compiler]');

      try {
        await pretest(newCompile);
        resolve(newCompile);
      } catch (err) { throw new Error('pretest failed'); }
    } catch (error) {
      console.error(error);
      reject(error);
    }
  });
}

module.exports = solcjs;
},{"./getCompile":47,"./getCompilersource":49,"./getVersion":52,"./loadModule":54,"./pretest":55,"./solc-wrapper/wrapper":63,"solc-version":42}],65:[function(require,module,exports){
const translateJsonCompilerOutput = require('./solc-wrapper/translate/standardTranslateJsonCompilerOutput');
const getCompileOutput = require('./getCompileOutput');
const getStandardError = require('./getStandardError');

module.exports = wrapperCompile;

function wrapperCompile(oldSolc, sourcecode, readCallback) {
  return new Promise(function (resolve, reject) {
    let output = getCompileOutput(oldSolc, sourcecode, readCallback);
    if (isCompilerFail(output)) {
      const standardError = getStandardError(output.errors);
      return reject(standardError);
    } else {
      const translateOutput = translateJsonCompilerOutput(oldSolc.opts, output);
      resolve(translateOutput);
    }
  });

  function isCompilerFail(output) {
    return !output.contracts || Object.keys(output.contracts).length == 0;
  }
}
},{"./getCompileOutput":48,"./getStandardError":51,"./solc-wrapper/translate/standardTranslateJsonCompilerOutput":61}],66:[function(require,module,exports){
const solcjs = require('solc-js')

onmessage = async e => {
  const sourcecode = e.data
  const compiler = await solcjs()
  const result = await compiler(sourcecode)
  console.log('1. worker result:', result)
  postMessage(result)
}

},{"solc-js":31}]},{},[66]);
