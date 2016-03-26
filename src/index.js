import { noView, customElement, bindable } from 'aurelia-templating';
import { decorators } from 'aurelia-metadata';
import angular from 'angular';
import hyphenate from 'lodash.kebabcase';

export function configure({ aurelia }) {
	aurelia.loader.addPlugin('angular-directive', {
		fetch(address) {
			// We're abusing the loader by using the address to specify
			// the angular module to load directives from.
			// The loader qualifies the URL, so we need to strip the prefix
			// to get back to the module name.
			const moduleName = address.split('/').slice(-1)[0];
			return getAngularDirectives(moduleName);
		},
	});
}

function getAngularDirectives(moduleName) {
	const module = angular.module(moduleName);
	const injector = angular.injector([ 'ng', moduleName ]);
	const directiveDefinitions = findDirectivesInModule(module, injector);

	return getCustomElements(directiveDefinitions, moduleName);
}

function findDirectivesInModule(module, injector) {
	// angular modules queue registrations in _invokeQueue
	// directive registrations look like ["$compileProvider", "directive", ["tabs", function(){}]]
	// we need to find the name of all the registered directives (e.g., "tabs")
	// which we can use to retrieve the directive definition object from the injector
	return module
		._invokeQueue
		.filter(instruction => instruction[1] === 'directive')
		.map(instruction => instruction[2][0])
		.map(name => injector.get(`${name}Directive`)[0])
		.filter(directive => (/E/).test(directive.restrict));
}

function getCustomElements(definitions, moduleName) {
	const elements = {};
	for (const directiveDefinition of definitions) {
		const elementName = hyphenate(directiveDefinition.name);
		elements[elementName] = createDirectiveCustomElement({ directiveDefinition, elementName, moduleName });
	}

	return elements;
}

function createDirectiveCustomElement({ directiveDefinition, elementName, moduleName }) {
	const scope = getScopeDefinition(directiveDefinition);
	const bindables = [];
	if (scope && typeof scope === 'object') {
		bindables.push(...getBindables(scope));
	}

	// set up bindings on the aurelia element for each bindable
	// scope property on the angular directive
	const bindableDecorators = bindables
		.map(x => bindable({
			name: x.name,
			attribute: hyphenate(x.name),
			changeHandler: 'attrChanged',
			defaultBindingMode: x.type === '=' ? 2 : 1,
		}));

	return decorators(
		noView(),
		customElement(elementName),
		...bindableDecorators
	).on(createCustomElementClass({ elementName, moduleName, bindables }));
}

let hostId = 0;

function createCustomElementClass({ elementName, moduleName, bindables }) {
	return class AngularDirective {
		static inject = [ Element ];

		constructor(element) {
			this.element = element;
		}

		attrChanged = () => null;

		bind() {
			if (!bindables.length) {
				// if the directive doesn't use any bindings we can just bootstrap
				// the host element as an angular root
				angular.bootstrap(this.element, [ moduleName ]);
				return;
			}

			// otherwise we need to generate a host directive to bridge
			// the aurelia element's bindings to the angular directive's scope
			const bridgeElement = document.createElement('aurelia-bridge');
			this.element.appendChild(bridgeElement);

			// Create a new angular module to avoid polluting the user's module
			// with our generated directive.
			// Directives are currently not reusable, so a new module and bridge
			// directive are created for each use.
			// TODO: will angular clean these up when the element is destroyed?
			this.hostModuleName = `aureliaHost${hostId++}`;
			angular.module(this.hostModuleName, [ moduleName ])
				.directive('aureliaBridge', this.getBridgeDirective());

			angular.bootstrap(bridgeElement, [ this.hostModuleName ]);
		}

		unbind() {
			angular.injector([ 'ng', this.hostModuleName ]).get('$rootScope').$destroy();
		}

		getBoundValues() {
			const values = {};
			for (const { name } of bindables) {
				values[name] = this[name];
			}

			return values;
		}

		getBridgeDirective() {
			return () => ({
				restrict: 'E',
				scope: {},
				link: ($scope) => {
					Object.assign($scope, this.getBoundValues());

					// update the angular scope when an aurelia binding changes
					this.attrChanged = () => {
						$scope.$apply(() => {
							Object.assign($scope, this.getBoundValues());
						});
					};

					// update the aurelia binding when a two-way angular scope property changes
					for (const { name } of bindables.filter(x => x.type === '=')) {
						$scope.$watch(name, (newValue, oldValue) => {
							if (newValue !== oldValue) {
								this[name] = newValue;
							}
						});
					}
				},
				template: getTemplateHtml({ elementName, bindables }),
			});
		}
	};
}

function getBindables(isolateScope) {
	const bindables = [];
	for (const name in isolateScope) {
		const [ , type, attrName ] = (/([@=<&])(.+)?/).exec(isolateScope[name]) || [];
		bindables.push({ name: attrName || name, type });
	}

	return bindables;
}

function getScopeDefinition({ bindToController, scope }) {
	// scope bindings can be specified on either `scope`, or `bindToController`
	return typeof bindToController === 'object' ? bindToController : scope;
}

function getTemplateHtml({ name, bindables }) {
	const attrStrings = bindables.map(x => {
		let expression = x.name;
		if (x.type === '&') {
			expression += '()';
		}

		return `${hyphenate(x.name)}="${expression}"`;
	});

	return `<${name} ${attrStrings.join(' ')}></${name}>`;
}
