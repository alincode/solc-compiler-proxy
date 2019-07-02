if (window.Worker) {
  const myWorker = new Worker('compiler-bundle.js')

  myWorker.postMessage('Hello')

  myWorker.onmessage = function(e) {
    const result = e.data
    console.log('2. main result:', result)
  }
}

function hello() {
  console.log('test')
}

module.exports = hello
