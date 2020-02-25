# Contributing

If you want to contribute, please make sure you've executed the tests.


### How to write new provider?
- create the provider filer under `/lib/provider`
- create the corresponding config both in `config/config.example` and `config/config.test.json` 
- make sure the selector matches and that the needed fields are available
- create a test under /test and make sure it is running successfully 

### How to write new notification adapter?
- create the provider filer under `/lib/notification/adapter`
- make sure it exports a function `enabled` and a function `send`
- create the corresponding config both in `config/config.example` and `config/config.test.json` 

#### Running Tests
If you've written a new provider you are an awesome person. You know it and I do. If you now write tests for it, you are even more awesome. And who doesn't want to be more awesome right?

To write tests for provider, you need to use Node 8 as the tests are using `async / await`

#### Codestyle
I'm using Eslint to maintain quote style and quality. Do not skip it...

##### To do before merging:

- executed tests? (`npm run test`)
- sure the changes are useful for everybody? Or is it maybe a custom modification just for your case?

_Thanks!_ :heart:
