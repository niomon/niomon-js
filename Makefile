.PHONY: all
all: build

.PHONY: build
build:
	yarn install --frozen-lockfile
	yarn build

.PHONY: dev
dev:
	yarn install --frozen-lockfile
	yarn dev

.PHONY: test
test:
	yarn install --frozen-lockfile
	yarn lint

.PHONY: clean
clean:
	yarn clean

.PHONY: publish
publish:
	yarn install --frozen-lockfile
	yarn prepare
	npm publish --access public