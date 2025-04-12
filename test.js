const MyClass = (() => {
  const privateStore = new WeakMap()

  return class MyClass {
    constructor(name) {
      privateStore.set(this, { name })

      const proxy = new Proxy(this, {
        get(target, prop) {
          if (prop === 'name') {
            return privateStore.get(target).name
          }
          return target[prop]
        },
        set(target, prop, value) {
          if (prop === 'name') {
            console.log('my new name: ', value)
            privateStore.get(target).name = value
            // 更新 proxy 上的 name 屬性
            Object.defineProperty(proxy, 'name', {
              value: value,
              enumerable: true,
              configurable: true,
              writable: true,
            })
            return true
          }
          target[prop] = value
          return true
        },
        ownKeys(target) {
          return ['name', ...Reflect.ownKeys(target)]
        },
        getOwnPropertyDescriptor(target, prop) {
          if (prop === 'name') {
            return {
              value: privateStore.get(target).name,
              enumerable: true,
              configurable: true,
              writable: true,
            }
          }
          return Reflect.getOwnPropertyDescriptor(target, prop)
        },
      })

      // 將 name 屬性直接定義在 proxy 上
      Object.defineProperty(proxy, 'name', {
        value: name,
        enumerable: true,
        configurable: true,
        writable: true,
      })

      return proxy
    }
  }
})()

const myClass = new MyClass('my-name')
console.log(myClass)
myClass.name = 'new-name'
console.log(myClass)
