if (window.Worker) {
  const myWorker = new Worker('./worker.js')

  myWorker.postMessage('Hello')

  myWorker.onmessage = function(e) {
    const result = e.data
    console.log('2. main result:', result)
  }
}
