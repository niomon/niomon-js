.PHONY: all
all: build

.PHONY: build
build:
	yarn install --frozen-lockfile
	yarn build

.PHONY: test
test:
	yarn install --frozen-lockfile
	yarn lint

.PHONY: clean
clean:
	yarn clean
