JSONEX = {
    allow_async: false,
    functions: {},
    undefined_function: function(name) {
        return new JSONEX.FunctionCall(name, Array.prototype.slice.call(arguments, 1));
    }
};

JSONEX.configure = function(options) {
    if ("allow_async" in options)
        this.allow_async = options.allow_async;
    if ("undefined_function" in options)
        this.undefined_function = options.undefined_function;
    if ("inherit_functions" in options && !options.inherit_functions)
        this.functions = options.functions || {};
    else if ("functions" in options)
        for (var key in options.functions)
            if (options.functions.hasOwnProperty(key))
                this.functions[key] = options.functions[key];
};

JSONEX.parser = function(options) {
    if (this.hasOwnProperty("functions"))
        throw "JSONEX.parser cannot be called as function (without new keyword)";
    this.functions = Object.create(this.functions);
    this.parser = function() { JSONEX.parser.apply(this, arguments); };
    this.parser.prototype = this;

    options && this.configure(options);
};
JSONEX.parser.prototype = JSONEX;

JSONEX.parse = function(str, options, ctx) {
    ctx = ctx || {};
    options = options ? new this.parser(options) : this;

    return JSON.parse(str, function (key, value) {
        if (key === "?")
            if (typeof value === "string") // { "?": "f", named_args }
                return [value];
            else if (value instanceof Array) { // { "?": ["f", args], named_args }
                return value;
            } else {
                console.warn && console.warn("Malformed JSONEX: '?' property must be string or array");
                return ["?", value];
            }

        if (typeof value === "object" && value && "?" in value) {
            var args = value["?"];

            if (args[0] == "?") {
                args.length == 2 || console.warn && console.warn("Malformed JSONEX: masked '?' property with wrong arguments number ");
                value["?"] = args[1];
            } else {
                if (Object.keys(value).length > 1) { // push named_args as last argument
                    delete value["?"];
                    args.push(value);
                }

                return ApplyFunction(args);
            }
        }

        return options.allow_async ? WrapAsync(value) : value;
    });

    function ApplyFunction(args) {
        var func;
        if (options.functions.hasOwnProperty(args[0]))       {
            func = options.functions[args.shift()];

        } else func = options.undefined_function;

        if (options.allow_async && !func.allow_input_promises) args = WrapAsync(args);

        if (typeof args.then === "function")
            return args.then(function(value) { return func.apply(ctx, value) });
        else
            return func.apply(ctx, args);
    }

    function WrapAsync(value) {
        if (typeof value != "object" || value === null) return value;

        var result = value instanceof Array ? [] : {};
        var last_promise = null;

        for (var key in value)
            if (value.hasOwnProperty(key))
            {
                if (value[key] && typeof value[key].then === "function")
                    last_promise = value[key].then(function(last_promise, key) {
                        return function (subresult) {
                            result[key] = subresult;
                            return last_promise;
                        };
                    }(last_promise, key));
                else
                    result[key] = value[key];
            }

        if (last_promise)
            return last_promise.then(function() { return result; });
        else
            return value;
    }
};

JSONEX.stringify = function(value, space) {
    return JSON.stringify(value, function(key, value) {
        if (key === "?" && !(value instanceof JSONEX.ArgumentList))
            return ["?", value];
        while (value && typeof value.toJSONEX === "function")
            value = value.toJSONEX();
        return value;
    }, space);
};

JSONEX.FunctionCall = function FunctionCall(name, args) {
    var result = "toJSONEX" in this ? this : object.create(JSONEX.FunctionCall.prototype);
    result.function = name;
    result.arguments = args;
    return result;
};

JSONEX.FunctionCall.prototype = {
    toJSONEX: function() {
        return { "?": new JSONEX.ArgumentList([this.function].concat(this.arguments)) };
    }
};

JSONEX.ArgumentList = function ArgumentList(args) {
    var result = "toJSONEX" in this ? this : object.create(JSONEX.ArgumentList.prototype);
    result.args = args;
    return result;
};

JSONEX.ArgumentList.prototype = {
    toJSONEX: function() {
        return this.args;
    }
};
