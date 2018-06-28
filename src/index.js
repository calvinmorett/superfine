var map = [].map
var isArray = Array.isArray
var IS_RECYCLED = 1
var IS_TEXT_NODE = 2

var clone = function(target, source) {
  var out = []

  for (var i in target) out[i] = target[i]
  for (var i in source) out[i] = source[i]

  return out
}

var eventProxy = function(event) {
  return event.currentTarget.events[event.type](event)
}

var updateProperty = function(element, name, lastValue, nextValue, isSvg) {
  if (name === "key") {
  } else {
    if (name[0] === "o" && name[1] === "n") {
      if (!element.events) {
        element.events = {}
      }
      element.events[(name = name.slice(2))] = nextValue

      if (nextValue) {
        if (!lastValue) {
          element.addEventListener(name, eventProxy)
        }
      } else {
        element.removeEventListener(name, eventProxy)
      }
    } else if (name in element && name !== "list" && !isSvg) {
      element[name] = nextValue == null ? "" : nextValue
    } else if (nextValue != null && nextValue !== false) {
      element.setAttribute(name, nextValue)
    }

    if (nextValue == null || nextValue === false) {
      element.removeAttribute(name)
    }
  }
}

var createElement = function(node, lifecycle, isSvg) {
  var element =
    node.flags & IS_TEXT_NODE
      ? document.createTextNode(node.name)
      : (isSvg = isSvg || node.name === "svg")
        ? document.createElementNS("http://www.w3.org/2000/svg", node.name)
        : document.createElement(node.name)

  var props = node.props
  if (props) {
    if (props.oncreate) {
      lifecycle.push(function() {
        props.oncreate(element)
      })
    }

    for (var i = 0; i < node.children.length; i++) {
      element.appendChild(createElement(node.children[i], lifecycle, isSvg))
    }

    for (var name in props) {
      updateProperty(element, name, null, props[name], isSvg)
    }
  }

  return (node.element = element)
}

var updateElement = function(
  element,
  lastProps,
  nextProps,
  lifecycle,
  isSvg,
  isRecycled
) {
  for (var name in clone(lastProps, nextProps)) {
    if (
      nextProps[name] !==
      (name === "value" || name === "checked" ? element[name] : lastProps[name])
    ) {
      updateProperty(element, name, lastProps[name], nextProps[name], isSvg)
    }
  }

  var cb = isRecycled ? nextProps.oncreate : nextProps.onupdate
  if (cb) {
    lifecycle.push(function() {
      cb(element, lastProps)
    })
  }
}

var removeChildren = function(node) {
  var props = node.props
  if (props) {
    for (var i = 0; i < node.children.length; i++) {
      removeChildren(node.children[i])
    }

    if (props.ondestroy) {
      props.ondestroy(node.element)
    }
  }
  return node.element
}

var removeElement = function(parent, node) {
  parent.removeChild(removeChildren(node))
}

var getKey = function(node) {
  return node ? node.key : null
}

var patchElement = function(
  parent,
  element,
  lastNode,
  nextNode,
  lifecycle,
  isSvg
) {
  if (nextNode === lastNode) {
  } else if (
    lastNode &&
    lastNode.flags & IS_TEXT_NODE &&
    nextNode.flags & IS_TEXT_NODE
  ) {
    if (lastNode.name !== nextNode.name) {
      element.nodeValue = nextNode.name
    }
  } else if (!lastNode || lastNode.name !== nextNode.name) {
    var newElement = parent.insertBefore(
      createElement(nextNode, lifecycle, isSvg),
      element
    )

    if (lastNode) removeElement(parent, lastNode)

    element = newElement
  } else {
    updateElement(
      element,
      lastNode.props,
      nextNode.props,
      lifecycle,
      (isSvg = isSvg || nextNode.name === "svg"),
      lastNode.flags & IS_RECYCLED
    )

    var lastChildren = lastNode.children
    var children = nextNode.children

    var oldStart = 0
    var oldEnd = lastChildren.length
    var newStart = 0
    var newEnd = children.length

    while (newStart <= newEnd && oldStart <= oldEnd) {
      var oldKey = getKey(lastChildren[oldStart])
      var newKey = getKey(children[newStart])

      if (oldKey == null || oldKey !== newKey) break

      patchElement(
        element,
        lastChildren[oldStart].element,
        lastChildren[oldStart],
        children[newStart],
        lifecycle,
        isSvg
      )
      oldStart++
      newStart++
    }

    while (newStart <= newEnd && oldStart <= oldEnd) {
      var oldKey = getKey(lastChildren[oldEnd])
      var newKey = getKey(children[newEnd])

      if (oldKey == null || oldKey !== newKey) break

      patchElement(
        element,
        lastChildren[oldEnd].element,
        lastChildren[oldEnd],
        children[newEnd],
        lifecycle,
        isSvg
      )
      oldEnd--
      newEnd--
    }

    if (oldStart > oldEnd) {
      while (newStart <= newEnd) {
        parent.insertBefore(
          createElement(children[newStart++], lifecycle, isSvg),
          lastChildren[oldStart].element
        )
      }
    } else if (newStart > newEnd) {
      while (oldStart <= oldEnd) {
        removeElement(element, lastChildren[oldStart++])
      }
    } else {
      var lastKeyed = {}
      var nextKeyed = {}

      for (var i = oldStart; i < oldEnd; i++) {
        var key = getKey(lastChildren[i])
        if (key != null) {
          lastKeyed[key] = lastChildren[i]
        }
      }

      var i = oldStart
      var k = newStart

      while (k < newEnd) {
        var lastKey = getKey(lastChildren[i])
        var nextKey = getKey(children[k])

        if (nextKeyed[lastKey]) {
          i++
          continue
        }

        if (nextKey != null && nextKey === getKey(lastChildren[i + 1])) {
          if (lastKey == null) {
            removeElement(element, lastChildren[i])
          }
          i++
          continue
        }

        if (nextKey == null || lastNode.flags & IS_RECYCLED) {
          if (lastKey == null) {
            patchElement(
              element,
              lastChildren[i] && lastChildren[i].element,
              lastChildren[i],
              children[k],
              lifecycle,
              isSvg
            )
            k++
          }
          i++
        } else {
          var keyedNode = lastKeyed[nextKey]

          if (lastKey === nextKey) {
            patchElement(
              element,
              keyedNode.element,
              keyedNode,
              children[k],
              lifecycle,
              isSvg
            )
            i++
          } else if (keyedNode && keyedNode.element) {
            patchElement(
              element,
              element.insertBefore(
                keyedNode.element,
                lastChildren[i] && lastChildren[i].element
              ),
              keyedNode,
              children[k],
              lifecycle,
              isSvg
            )
          } else {
            patchElement(
              element,
              lastChildren[i] && lastChildren[i].element,
              null,
              children[k],
              lifecycle,
              isSvg
            )
          }

          nextKeyed[nextKey] = children[k]
          k++
        }
      }

      while (i < oldEnd) {
        if (getKey(lastChildren[i]) == null) {
          removeElement(element, lastChildren[i])
        }
        i++
      }

      for (var key in lastKeyed) {
        if (!nextKeyed[key]) {
          removeElement(element, lastKeyed[key])
        }
      }
    }
  }

  return (nextNode.element = element)
}

var createTextNode = function(text, element) {
  return createNode(text, null, null, element, IS_TEXT_NODE)
}

var createNode = function(name, props, children, element, flags) {
  return {
    name: name,
    props: props,
    children: children,
    element: element,
    key: props && props.key,
    flags: flags || 0
  }
}

var recycleChild = function(element) {
  return element.nodeType === 3 // Node.TEXT_NODE
    ? createTextNode(element.nodeValue, element)
    : recycleElement(element)
}

var recycleElement = function(element) {
  return createNode(
    element.nodeName.toLowerCase(),
    {},
    map.call(element.childNodes, recycleChild),
    element,
    IS_RECYCLED
  )
}

export var recycle = function(container) {
  return recycleElement(container.children[0])
}

export var render = function(lastNode, nextNode, container) {
  var lifecycle = []
  var element = container.children[0]

  patchElement(container, element, lastNode, nextNode, lifecycle)

  while (lifecycle.length) lifecycle.pop()()

  return nextNode
}

export var h = function(name, props) {
  props = props || {}

  var rest = []
  var children = []
  var length = arguments.length

  while (length-- > 2) rest.push(arguments[length])

  if (props.children != null) {
    rest.push(props.children)
    delete props.children
  }

  while (rest.length) {
    var node = rest.pop()
    if (node && isArray(node)) {
      for (length = node.length; length--; ) {
        rest.push(node[length])
      }
    } else if (node != null && node !== true && node !== false) {
      children.push(
        typeof node === "string" || typeof node === "number"
          ? createTextNode(node)
          : node
      )
    }
  }

  return typeof name === "function"
    ? name(props, (props.children = children))
    : createNode(name, props, children)
}
