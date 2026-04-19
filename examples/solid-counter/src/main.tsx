import { render } from 'solid-js/web'
import Counter from './Counter.jot'

const root = document.getElementById('root')
if (!root) throw new Error('root not found')
render(() => <Counter initial={0} />, root)
