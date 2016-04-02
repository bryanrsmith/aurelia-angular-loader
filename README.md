# aurelia-angular-loader
An Aurelia loader plugin that lets you use Angular directives in Aurelia view templates.

It works by searching an Angular module for directive definitions. For each directive an Aurelia custom element is generated, using the directive definition's scope object to define Aurelia bindings. When the custom element is rendered it generates an Angular directive to act as a bridge. This bridge uses Aurelia binding changes to update Angular's scope, and Angular scope changes to update Aurelia bindings. This bridge directive is rendered into a new Angular application bootstrapped in the custom element.

## Installation
First install the loader plugin.

With jspm:
```
jspm install npm:aurelia-angular-loader
```

Or Webpack:
```
npm install --save aurelia-angular-loader
```

Then register the plugin with Aurelia.

```diff
export function configure(aurelia) {
  aurelia.use
    .standardConfiguration()
    .developmentLogging()
+   .plugin('aurelia-angular-loader');

  aurelia.start().then(() => aurelia.setRoot());
}
```

## Use

You will need to take care of loading your Angular module on your own. Once you've done that you can use Angular directives that specify a restriction of `E` by importing the Angular module into an Aurelia view. Instead of the JS module path, specify the Angular module name, and use the `!angular-directive` loader.

In `main.js`:
```js
import angular from 'angular';

export function configure(aurelia) {
  aurelia.use
    .standardConfiguration()
    .developmentLogging()
    .plugin('aurelia-angular-loader');

  // set up angular stuff. You can do this anywhere you want as long as
  // it's available when aurelia-view.html asks for it
  angular
    .module('angular-components', [])
    .directive('myAngularDirective', () => ({
      restrict: 'E',
      scope: {
        name: '=',
        submit: '&',
      },
      template: '<div>Hello, {{name}}! <button ng-click="submit()">Submit</button></div>',
    }));

  aurelia.start().then(() => aurelia.setRoot());
}
```

In `aurelia-view.html`:
```html
<template>
  <require from="angular-components!angular-directive"></require>

  <input ref="in" />
  <my-angular-directive name.bind="in.value" submit.call="submit()"></my-angular-directive>
</template>
```


## Limitations
This is experimental, and probably shouldn't be used in production. Some issues you may run into:

* Angular directives are each rendered into their own app, so things like `require` on your directive definition won't work right.
* I'm not sure how to clean up Angular modules, so it probably leaks memory a tiny bit.
* Scope is not currently inherited from Aurelia binding contexts.
