/**
 * Module for parsing form texts <br>
 * <br>
 * The forms are described via a YAML notaion.<br>
 * Here are <br>
 *  1. test: <br>
 *   If the test is positive, it is this form.
 *   With this, the sender and the type of form can be recognised.<br>
 *  2. option: <br>
 *   Contains general defaults and conversions, 
 *   For example, decimal separators or date formatting.<br>
 *  3. fields: <br>
 *   Contains the fields to be parsed; here, "static" fields with * fixed values can be defined, or "static" fields with
 *   fixed values or "date" or "float" fields can be defined,
 *   which are then converted automatically.<br>
 *<br>
 *    Example<br>
 *    static_address: xyz <br>
 *    invoice_date: xyz <br>
 * <br>
 *   The fields can be defined via RegExp, whereby the 
 *   result fields must be marked as group "(...)".
 * 
 * @module formparser
 * @version 0.0.1
 * @license MIT 
 * @author jankstar
 * 
 */
const formparser = (() => {
    const fs = require('fs').promises;
    const yaml = require('js-yaml')
    const date_fns = require('date-fns')
    const { v4: uuidv4 } = require('uuid');

    class ParseField {
        constructor(iValue) {
            this.name = iValue.name || ''
            this.data = iValue.data || iValue.regex || ''
            this.modifiers = iValue.modifiers || ''
            let lRegEx = iValue.regex || ''
            let lModifiers = this.modifiers.replace(/[^igm]/g, '') //at this point only igm 
            this.regex = new RegExp(lRegEx, lModifiers)
            this.format = iValue.format || ''
        }
    }

    /**
     * ParseOption
     * @property {String} langu
     * @property {String} date_formats formate for 'date-fns parse' https://date-fns.org/v2.28.0/docs/parse
     * @property {Array} replace to replace the character in the text
     * @property {String} decimal_separator
     * @property {String} thousand_separator
     * @property {String} group_separator  i.e. ', ' if there are several groups of elements that should be linked together 
     * @property {Boolean} remove_accents
     * @property {String} modifiers  i - case insensitive, g - global match, m - multiline, x - ignore space
     */
    class ParseOption {
        constructor(iOptions) {
            iOptions = iOptions || {}
            this.langu = iOptions.langu || 'en-UK'
            this.date_formats = iOptions.date_formats || 'dd.MM.yyyy'
            this.replace = iOptions.replace || []
            this.decimal_separator = iOptions.decimal_separator || '.'
            this.thousand_separator = iOptions.thousand_separator || ','
            this.group_separator = iOptions.group_separator || ', '
            this.remove_accents = iOptions.remove_accents || false
            this.modifiers = iOptions.modifiers || 'g' //i - case insensitive, g - global match, m - multiline, x - ignore space
        }
    }

    /**
     * ParseTemplate is the class for managing the templates for parsing a form.
     * @property {String} id uuid 
     * @property {String} name the name for identification
     * @property {String} group the group classifies the template, e.g. invoices
     * @property {Array} test Array if String for testing 
     * @property {ParseOption} Option are the general parameters of the parsing, e.g. format for date
     * @property {ParseField} fields Array of ParsField
     * @property {Array} protocol Array aof String
     */
    class ParseTemplate {

        /**
         * constructor
         * @param {*} iValue contains the property values without protocol
         */
        constructor(iValue) {
            iValue = iValue || {}
            this.id = iValue.id || uuidv4()
            this.name = iValue.name || ''   //Name des Parse-Template 
            this.group = iValue.group || '' //Formulargruppe
            this.test = iValue.test || []   //RegEx als Test, damit dieses Template gezogen wird
            iValue.options = iValue.options || {}
            this.options = new ParseOption(iValue.options)
            this.fields = []
            iValue.fields = iValue.fields || {}
            for (let prop in iValue.fields) {
                if (typeof iValue.fields[prop] == 'string') {
                    this.fields.push(new ParseField({ name: prop, regex: iValue.fields[prop] }))
                } else {
                    let lEle = iValue.fields[prop] || {}
                    lEle['name'] = prop
                    this.fields.push(new ParseField(lEle))
                }
            }


            //
            this.protocol = []

        }

        /**
         * check error occurred; the protocol string must start with ERROR
         * @returns true - error occurred
         */
        errorOccurred() {
            for (let i = this.protocol.length; i >= 0; i--) {
                if (this.protocol[i].toUpperCase().startsWith('ERROR')) {
                    return true
                }
            }
            return false
        }

        /**
         * Clear protocol
         */
        clearProtocol() {
            this.protocol = []
        }

        /**
         *  Checks whether the template conforms to the "test". test durchführen
         * @param {String} iText the text for parsing
         * @returns {Boolean} true - the template ist valid
         */
        performTest(iText) {
            try {
                let lFlag = ''
                for (let ele of this.test) {
                    let lExtraEle = ele.replace(/\/[xig]*$/, '')
                    if (/\/[xg]*i[xg]*$/.test(ele)) {
                        lFlag = 'i'
                    }
                    if (/\/[ig]*x[ig]*$/.test(ele)) {
                        lExtraEle = lExtraEle.replace(/[ ]*/g, '')
                        let lRegEx = new RegExp(lExtraEle, lFlag)
                        if (!lRegEx.test(iText.replace(/[ ]*/g, ''))) {
                            return false;
                        }
                    } else {
                        let lRegEx = new RegExp(lExtraEle, lFlag)
                        if (!lRegEx.test(iText)) {
                            return false;
                        }
                    }
                }
                return true;
            } catch (err) {
                this.protocol.push(`Error: ${err.message}`)
                return false;
            }
        }

        /**
         * extract all fields of the ParseTemplate from the text
         * @param {String} iText is the raw text
         * @returns {Object} {data, regex, protocol, error} the parsed fields are in data as a json object
         */
        parseData(iText) {
            let lData = {}
            let lRegEx = {}
            let lProtocol = {}
            try {
                if (!iText || typeof iText != 'string') { throw Error(`Text parameter is not a string.`) }

                //Replace all substitutions
                this.options.replace.forEach((elem) => {
                    iText = iText.replace(elem[0], elem[1])
                })

                //Replace all remove_accents
                if (this.options.remove_accents) {
                    iText = iText.normalize('NFD').replace(/[\u0300-\u036f]/g, "")
                }

                let lRealName = ''
                this.fields.forEach((field) => {
                    try {
                        lRealName = field.name.replace('static_', '')
                        if (!field.name) { return } //we need name

                        lData[lRealName] = ''
                        lProtocol[lRealName] = []
                        lRegEx[lRealName] = []

                        if (field.name.startsWith('static_')) {
                            lData[lRealName] = field.data;
                        } else {
                            let lMyRegEx = new RegExp(field.regex, field.modifiers.replace(/[^gmi]/g, ''))
                            let lMatch = []
                            let lArray = undefined
                            if (field.modifiers.includes('x')) {
                                while ((lArray = lMyRegEx.exec(iText.replace(/\s/g, ''))) !== null) {
                                    lMatch.push(lArray)
                                    if (!field.modifiers.includes('g')) { break } //if no g - globally stop here !
                                }
                            } else {
                                while ((lArray = lMyRegEx.exec(iText)) !== null) {
                                    lMatch.push(lArray)
                                    if (!field.modifiers.includes('g')) { break } //if no g - globally stop here !
                                }
                            }

                            lRegEx[lRealName] = lMatch;
                            if (lMatch && lMatch.length && lMatch[0] && lMatch[0].length) {

                                lData[lRealName] = ''
                                for (let i = 0; i < lMatch.length; i++) {
                                    if (lData[lRealName] != '' && !field.modifiers.includes('g')) { break } //only 1x result
                                    if (lMatch[i] && lMatch[i].length && lMatch[i].length > 1) {
                                        //1 ist gruppen-match
                                        for (let j = 1; j < lMatch[i].length; j++) {
                                            if (lMatch[i][j] && typeof lMatch[i][j] == 'string') {
                                                if (lData[lRealName] == '') {
                                                    lData[lRealName] = lMatch[i][j]
                                                } else {
                                                    lData[lRealName] = `${lData[lRealName]}${this.options.group_separator}${lMatch[i][j]}`
                                                }
                                            }
                                        }
                                    } else if (lMatch && lMatch[i][0]) {
                                        //If no group match, then take this one
                                        lData[lRealName] = lMatch[i][0]
                                    }
                                }
                            } else {
                                lProtocol[lRealName].push(`Error: RegEx - nothing found`)
                                return
                            }

                        }
                        if (field.name.endsWith('float')) {
                            if (this.options.thousand_separator && lData[lRealName]) {
                                let lRegEx = new RegExp(this.options.thousand_separator.replace('\.', '\\.'), 'g')
                                lData[lRealName] = lData[lRealName].replace(lRegEx, '')
                            }
                            if (this.options.decimal_separator && this.options.decimal_separator != '.' && lData[lRealName]) {
                                let lRegEx = new RegExp(this.options.decimal_separator.replace('\.', '\\.'), 'g')
                                lData[lRealName] = lData[lRealName].replace(lRegEx, '.')
                            }
                            let lfloat = parseFloat(lData[lRealName]) || 0.0
                            lData[lRealName] = lfloat
                        }

                        if (field.name.endsWith('date')) {
                            let lFormate = field.format || this.options.date_formats

                            let lDate_date = date_fns.parse(lData[lRealName], lFormate, new Date())
                            if (lDate_date) {
                                lData[lRealName] = lDate_date
                            }
                        }
                    } catch (err) {
                        lData[lRealName] = lData[lRealName] || ''
                        lProtocol[lRealName].push(`Error: ${err.message}`)
                        this.protocol.push(`Error: Field ${lRealName} ${err.message}`)

                    }
                })


                return { data: lData, regex: lRegEx, protocol: lProtocol, error: undefined }
            } catch (err) {
                return { data: undefined, regex: lRegEx, protocol: lProtocol, error: err }
            }

        }


    }

    return {

        ParseTemplate,

        /**
         * Returns an object(json) from a yaml string.
         * @param {String} iYaml 
         * @returns {ParseTemplate}
         * 
         * @example 
         * # -*- coding: utf-8 -*-
         * name: PPP berlin-brandenburg-hamburg     #name of the file
         * group: rechnung                          #group of the file
         * test:
         *     - PPP berlin-brandenburg-hamburg/i                                            #i - caseinsensitive
         *     - '(IBAN: DE99 1111 2222 3333 4444 55)|(IBAN: DE99 0000 0000 1111 2222 00)/x' #x - trim spaces
         *     - Rechnung
         * options:
         *     langu: de-DE
         *     decimal_separator: ','
         *     thousand_separator: '.'
         *     group_separator: ', '                        #when working with several groups in RegExp, the groups are concatenated to each other
         *     remove_accents: false
         *     modifiers: gi                                #optional g - global, i - caseinsesitive, x - no-space
         *     currency: EUR
         *     date_formats: 'd.M.y'                        #formate for 'date-fns parse' https://date-fns.org/v2.28.0/docs/parse
         *     replace:
         *     - ['€', 'EUR']                               #replace characters
         *     - ['|', ' ' ]
         *     required_fields:
         *     - invoice_number
         *     - recipient_name
         *     - recipient_addr
         * fields:
         *     invoice_amount_float:                        #at the end _float converts to a float number
         *         regex: (\d+,\d+) +EUR Rechnungsbetrag
         *         modifiers: gi                            #optional g - global, i - caseinsesitive, x - no-space
         *     static_currency: EUR
         *     invoice_date: Rechnungsdatum +(\d{1,2}\.\d{1,2}\.\d{2,4}) #at the end _date converts to a date object 
         *     invoice_number: Rechnungsnummer +([\d\S]*)                #Attention _number remains a string
         *     recipient_name: (Hans Müller)|(Marie Schmidt)
         *     recipient_addr: (Hauptstraße +100).+[\s]+(1000 +Berlin)
         *     IBAN: 
         *       regex: 'IBAN:(\w{10,30})'
         *       modifiers: gxi                             #this will find all IBAN as ',' separated string, no-space, caseinsesitive
         *     BIC: 'BIC: (\w{8,11})'
         *     static_sender_name: PPP berlin-brandenburg-hamburg
         *     static_sender_addr: Hautpstraße, 100 - 10000 Berlin
         *     subject: \s[.]*(MVZ Berlin)[.]*\s
         *     static_category: Familie, Rechnung
         * 
         */
        yaml2Object(iYaml) {
            let data = undefined;
            try {
                data = yaml.load(iYaml)
                return { data: data, error: undefined }
            } catch (err) {
                return { data: undefined, error: err }
            }
        },

        /**
         * test with test files <br>
         * 1. read yaml file <br>
         * 2. convert yaml to jsom object <br>
         * 3. Initialise a ParsTemplate <br>
         * 4. read test file for a form as text/string <br>
         * 5. checkt test whether the text fits the template <br>
         * 6. Extract the fields to the form
         * 
         */
        async test() {
            try {
                //read and convert yaml-file to json-Object 
                let lYamlFile = await fs.readFile(`${__dirname}/test/test.yaml`, 'utf-8')
                let { data: yamlDat } = formparser.yaml2Object(lYamlFile);

                //init ParseTemplate
                let lPaTe = new ParseTemplate(yamlDat)
                console.log(lPaTe)

                let lText = await fs.readFile(`${__dirname}/test/ad89bea8-bd96-4cfd-942d-8d1e06cd9271000.jpg.txt`, 'utf-8');

                //Test a text for validity (test)to the ParseTemplate
                let lValide = lPaTe.performTest(lText)
                console.log(lValide)

                if (lValide) {
                    //extract all fields of the ParseTemplate from the text
                    let { data: lData, regex: lRegEx, protocol: lProtocol, error: lError } = lPaTe.parseData(lText)
                    console.log({lData, lRegEx, lProtocol, lError})
                }

            } catch (err) {
                console.log(err)
            }
        }
    }

})();

module.exports = {
    formparser
}