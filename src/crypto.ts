import { BinaryLike, createHash } from 'crypto'

export const sha256 = (data: BinaryLike): Buffer => {
	const h = createHash('sha256')
	h.update(data)
	return h.digest()
}
