# formparser Module
This module is based on the Python library "https://pypi.org/project/invoice2data/" for extracting data from text.<br>
For this purpose RegExp are used to determine the variable values from the text. The specification of the fields and the general defaults, e.g. substitution of characters is done in a YAML notation. 

This module provides the following functions:

## Parse File

### YAML file for the specification of the form
Example
### 1 YAML File or data
```
# -*- coding: utf-8 -*-
name: PPP berlin-brandenburg-hamburg     #name of the file
group: rechnung                          #group of the file
test:
    - PPP berlin-brandenburg-hamburg/i                                            #i - caseinsensitive
    - '(IBAN: DE99 1111 2222 3333 4444 55)|(IBAN: DE99 0000 0000 1111 2222 00)/x' #x - trim spaces
    - Rechnung
options:
    langu: de-DE
    decimal_separator: ','
    thousand_separator: '.'
    group_separator: ', '                        #when working with several groups in RegExp, the groups are concatenated to each other
    remove_accents: false
    modifiers: gi                                #optional g - global, i - caseinsesitive, x - no-space
    currency: EUR
    date_formats: 'd.M.y'                        #formate for 'date-fns parse' https://date-fns.org/v2.28.0/docs/parse
    replace:
    - ['€', 'EUR']                               #replace characters
    - ['|', ' ' ]
    required_fields:
    - invoice_number
    - recipient_name
    - recipient_addr
fields:
    invoice_amount_float:                        #at the end _float converts to a float number
        regex: (\d+,\d+) +EUR Rechnungsbetrag
        modifiers: gi                            #optional g - global, i - caseinsesitive, x - no-space
    static_currency: EUR
    invoice_date: Rechnungsdatum +(\d{1,2}\.\d{1,2}\.\d{2,4}) #at the end _date converts to a date object 
    invoice_number: Rechnungsnummer +([\d\S]*)                #Attention _number remains a string
    recipient_name: (Hans Müller)|(Marie Schmidt)
    recipient_addr: (Hauptstraße +100).+[\s]+(1000 +Berlin)
    IBAN: 
      regex: 'IBAN:(\w{10,30})'
      modifiers: gxi                             #this will find all IBAN as ',' separated string, no-space, caseinsesitive
    BIC: 'BIC: (\w{8,11})'
    static_sender_name: PPP berlin-brandenburg-hamburg
    static_sender_addr: Hautpstraße, 100 - 10000 Berlin
    subject: \s[.]*(MVZ Berlin)[.]*\s
    static_category: Familie, Rechnung
```

### 2 Read File and initialize ParsTemplate
Read the YAML file and initialize the ParsTemplate object:
```
    //read and convert yaml-file to json-Object 
    let lYamlFile = await fs.readFile(`${__dirname}/test/test.yaml`, 'utf-8')
    let { data: yamlDat } = formparser.yaml2Object(lYamlFile);

    //init ParseTemplate
    let lPaTe = new ParseTemplate(yamlDat)
```

### 3 Test text on template
It can be tested if the text is valid for the template, e.g. if it is the supplier or sender of the text:
```
    let lText = await fs.readFile(`${__dirname}/test/ad89bea8-bd96-4cfd-942d-8d1e06cd9271000.jpg.txt`, 'utf-8');

    //Test a text for validity (test)to the ParseTemplate
    let lValide = lPaTe.performTest(lText)  //true or false
    console.log(lValide) 
```

### 4 Extract variables from the text
If the test of the template is positive, then the variables can be extracted according to the YAML specification:
```
    if (lValide) {
        //extract all fields of the ParseTemplate from the text
        let { data: lData, regex: lRegEx, protocol: lProtocol, error: lError } = lPaTe.parseData(lText)
        console.log({lData, lRegEx, lProtocol, lError})
    }
```
Example of a response:
```
{lData: {…}, lRegEx: {…}, lProtocol: {…}, lError: undefined}
    lData: {invoice_amount_float: 32.16, currency: 'EUR', invoice_date: Sun Dec 05 20 …}
        BIC: 'DAAEDEDDXXX'
        category: 'Familie, Rechnung'
        currency: 'EUR'
        IBAN: 'DE99999966664444333322, DE53333344445555666677, DE99000000001111222200, DE99111122223333444455'
        invoice_amount_float: 32.16
        invoice_date: Sun Dec 05 2021 00:00:00 GMT+0100 (Central European Standard Time)
        invoice_number: '6142/002497/'
        recipient_addr: 'Hauptstraße 100, 1000 Berlin'
        recipient_name: 'Hans Müller'
        sender_addr: 'Hautpstraße, 100 - 10000 Berlin'
        sender_name: 'PPP berlin-brandenburg-hamburg'
        subject: 'MVZ Berlin'
    lError: undefined
    lProtocol: {invoice_amount_float: Array(0), currency: Array(0), invoice_date: Array(0), invoice_number: Array(0), recipient_name: Array(0), …}
    lRegEx: {invoice_amount_float: Array(1), currency: Array(0), invoice_date: Array(1), invoice_number: Array(1), recipient_name: Array(1), …}
```