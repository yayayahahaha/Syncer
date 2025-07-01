start()
function start() {
  const m = null
  const d = null
  const startWith = m != null && d != null ? { m, d } : null

  clickAll(startWith)
}

function getCurrentSelectNumber() {
  const selectElement = document.querySelector('.pUfOZ')
  if (selectElement == null) return 0
  const text = selectElement.innerText
  const regexp = /^已選取 (\d+) 張相片$/

  const match = text.match(regexp)
  if (match) return parseInt(match[1], 10)
  return 0
}

function scrollDown(top = false) {
  const container = document.querySelector('.Purf9b.THsa9b.zcLWac.eejsDc.lnJaGb.x2Gptc')
  if (top) {
    container.scrollTop = 0
    return true
  }

  const previous = container.scrollTop

  container.scrollTop += 1000

  const next = container.scrollTop

  return previous !== next
}

async function clickAll(startWith = null) {
  const selectButotns = [...document.querySelectorAll('[jsaction="click:eWXOff"]')]

  if (!Array.isArray(selectButotns)) return
  const event = new Event('click', { bubbles: true, cancelable: true })

  let currentSelectedCount = getCurrentSelectNumber()
  let overflowButton = selectButotns[selectButotns.length - 1]

  for (let index = 0; index < selectButotns.length; index++) {
    const element = selectButotns[index]
    const text = element.parentNode.querySelector('h2').innerText
    if (startWith != null) {
      const { m, d } = startWith
      const [, matchedM, matchedD] = text.match(/(\d+)月(\d+)日/) ?? []
      if (Number(matchedM) !== m || Number(matchedD) > d) continue
    }

    if (typeof element.dispatchEvent !== 'function') continue

    const checked = element.getAttribute('aria-checked') === 'true'
    if (checked) continue

    element.dispatchEvent(event)

    await new Promise((r) => setTimeout(r, 0))

    currentSelectedCount = getCurrentSelectNumber()
    if (currentSelectedCount > 2000) {
      overflowButton = element
      console.log(`單月超過了，下一次要從 ${text} 開始選`)
      break
    }

    console.log(`選到 ${text}, 已經選了 ${getCurrentSelectNumber()} 張照片`)
  }

  const currentNumber = getCurrentSelectNumber()
  if (currentNumber < 2000) {
    const hasScroll = scrollDown()
    await new Promise((r) => setTimeout(r, startWith != null ? 500 : 500))
    hasScroll ? clickAll(startWith) : console.log('結束囉')
  } else {
    console.log('超過了')
    overflowButton.dispatchEvent(event)
  }
}
