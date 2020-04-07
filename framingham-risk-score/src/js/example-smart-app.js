(function (window) {
    window.extractData = function () {
        var ret = $.Deferred();

        function onError() {
            console.log('Loading error', arguments);
            ret.reject();
        }

        // Framingham Coefficients for Men
        var age_men = 52.00961;
        var tcl_men = 20.014077;
        var hdl_men = -0.905964;
        var sbp_men = 1.305784;
        var bpTx_men = 0.241549;
        var smk_men = 12.096316;
        var ageTcl_men = -4.605038;
        var ageSmk_men = -2.84367;
        var age2_men = -2.93323;
        var con_men = 172.300168;

        // Framingham Coefficients for Women
        var age_women = 31.764001;
        var tcl_women = 22.465206;
        var hdl_women = -1.187731;
        var sbp_women = 2.552905;
        var bpTx_women = 0.420251;
        var smk_women = 13.07543;
        var ageTcl_women = -5.060998;
        var ageSmk_women = -2.996945;
        var con_women = 146.5933061;

        // Other variables
        var rxClassBase = "https://rxnav.nlm.nih.gov/REST/rxclass/class/byRxcui.json?rxcui="; // Base URL for RxClass API
      
        function onReady(smart) {

            if (smart.hasOwnProperty('patient')) {

                var patient = smart.patient;
                var pt = patient.read();
                var obv = smart.patient.api.fetchAll({
                    type: 'Observation',
                    query: {
                        code: {
                            $or: [
                                'http://loinc.org|8462-4', // DBP
                                'http://loinc.org|8480-6', // SBP
                                'http://loinc.org|2085-9', // HDL
                                'http://loinc.org|2089-1', // LDL
                                'http://loinc.org|13457-7', // LDL
                                'http://loinc.org|18262-6', // LDL
                                'http://loinc.org|2093-3', // Total Cholesterol
                                'http://loinc.org|55284-4', // Blood pressure systolic & diastolic
                                'http://loinc.org|30525-0', // Age
                                'http://loinc.org|21611-9', // Age (estimated)
                                'http://loinc.org|21612-7', // Age (reported)
                                'http://loinc.org|29553-5', // Age (calculated)
                                'http://loinc.org|72166-2', // Tobacco smoking status in social history
                                'http://loinc.org|81229-7', // Tobacco smoking status - Tobacco Smoker
                                'http://loinc.org|11366-2', // Tobacco use status
                                'http://loinc.org|11367-0', // Tobacco use status
                                'http://loinc.org|39240-7', // Tobacco use status
                                'http://loinc.org|2571-8', // Triglycerides (mass/volume in Serum or plasma)
                                'http://loinc.org|3043-7', // Triglycerides (mass/volume in Blood)
                                'http://loinc.org|3049-4', // Triglycerides (mass/volume in serum or plasma) - Deprecated
                            ]
                        }
                    }
                });
                     
                var meds = smart.patient.api.fetchAll({
                    type: 'MedicationDispense',
                    query: {
                        status: "completed"
                        //code: 'http://www.nlm.nih.gov/research/umls/rxnorm|153666' // "irbesartan 150 MG Oral Tablet [Avapro]"
                    }                            
                });

                $.when(pt, obv, meds).fail(onError);

                $.when(pt, obv, meds).done(function (patient, obv, meds) {

                    var byObvCodes = smart.byCodes(obv, 'code');
                    var gender = patient.gender;
                    var fname = '';
                    var lname = '';

                    if (typeof patient.name[0] !== 'undefined') {
                        fname = patient.name[0].given.join(' ');
                        lname = patient.name[0].family.join(' ');
                    }

                    var tgl = byObvCodes('2571-8', '3043-7', '3049-4');
                    var smk = byObvCodes('72166-2', '81229-7', '11366-2', '11367-0', '39240-7');
                    var sbp_formatted = getBloodPressureValueAndUnit(byObvCodes('55284-4'), '8480-6');
                    var dbp_formatted = getBloodPressureValueAndUnit(byObvCodes('55284-4'), '8462-4');
                    var sbp = getBloodPressureValue(byObvCodes('55284-4'), '8480-6');
                    var hdl = byObvCodes('2085-9');
                    var ldl = byObvCodes('2089-1', '13457-7', '18262-6');
                    var tcl = byObvCodes('2093-3');

                    // Set default patient object
                    var p = defaultPatient();

                    // Patient demographics
                    p.birthdate = patient.birthDate;
                    p.gender = gender;
                    p.fname = fname;
                    p.lname = lname;
                    p.age = getAge(p.birthdate);

                    // Determine if patient is on blood pressure medications (medications dispensed)
                    var onBpMeds;

                    if (typeof meds[0] != 'undefined') {
                
                        rxNormCuis = getRxCuis(meds);
                        var medClassCheck = "antihypertensive agents";
                        var medClassCheckArray = [];

                        for (i = 0; i < rxNormCuis.length; i++) {
                            var rxGetString = JSON.stringify(httpGet(rxClassBase.concat(rxNormCuis[i]))).toLowerCase();
                            var isBpMed = rxGetString.includes(medClassCheck);
                            medClassCheckArray.push(isBpMed);
                        }

                        if (medClassCheckArray.includes(true)) {
                            onBpMeds = 1;
                            p.meds = 'Yes';
                        } else {
                            onBpMeds = 0;
                            p.meds = 'No';
                        }
            
                    } else {
                        p.meds = 'Unk';
                    }

                    // Determine patient's smoking status
                    var smk_status;

                    if (typeof smk[0] != 'undefined') {

                        if (getSmokingStatus(smk[0]).toLowerCase().includes("current")) {
                            smk_status = 1;
                        } else {
                            smk_status = 0;
                        }
                        p.smk = getSmokingStatus(smk[0]);                  
                    } else {
                        smk_status = 0;
                        p.smk = 'Unk';
                    }

                    // Systolic blood pressure
                    if (typeof sbp_formatted != 'undefined') {
                        p.sbp = sbp_formatted;
                    } else {
                        p.sbp = 'Unk';
                    }

                    // Diastolic blood pressure
                    if (typeof dbp_formatted != 'undefined') {
                        p.dbp = dbp_formatted;
                    } else {
                        p.dbp = 'Unk';
                    }

                    // HDL cholesterol
                    if (typeof hdl[0] != 'undefined') {
                        p.hdl = getQuantityValueAndUnit(hdl[0]);
                    } else {
                        p.hdl = 'Unk';
                    }

                    // LDL cholesterol
                    if (typeof ldl[0] != 'undefined') {
                        p.ldl = getQuantityValueAndUnit(ldl[0]);
                    } else {
                        p.ldl = 'Unk';
                    }

                    // Total cholesterol
                    if (typeof tcl[0] != 'undefined') {
                        p.tcl = getQuantityValueAndUnit(tcl[0]);
                    } else {
                        p.tcl = 'Unk';
                    }

                    // Triglycerides
                    if (typeof tgl[0] != 'undefined') {
                        p.tgl = getQuantityValueAndUnit(tgl[0]);
                    } else {
                        p.tgl = 'Unk';
                    }

                    // Risk Calculation (https://www.mdcalc.com/framingham-risk-score-hard-coronary-heart-disease#evidence)
                    var coef;
                    var risk;

                    if (typeof p.age == 'number' &&
                        typeof getQuantityValue(tcl[0]) == 'number' &&
                        typeof getQuantityValue(hdl[0]) == 'number' &&
                        typeof sbp == 'number' &&
                        typeof onBpMeds == 'number' &&
                        typeof smk_status == 'number') {


                        if (gender == 'female') {

                            if (p.age > 78) {

                                coef = age_women * ln(p.age) +
                                    tcl_women * ln(getQuantityValue(tcl[0])) +
                                    hdl_women * ln(getQuantityValue(hdl[0])) +
                                    sbp_women * ln(sbp) +
                                    bpTx_women * onBpMeds +
                                    smk_women * smk_status +
                                    ageTcl_women * ln(p.age) * ln(getQuantityValue(tcl[0])) +
                                    ageSmk_women * ln(78) * smk_status -
                                    con_women;

                            } else {

                                coef = age_women * ln(p.age) +
                                    tcl_women * ln(getQuantityValue(tcl[0])) +
                                    hdl_women * ln(getQuantityValue(hdl[0])) +
                                    sbp_women * ln(sbp) +
                                    bpTx_women * onBpMeds +
                                    smk_women * smk_status +
                                    ageTcl_women * ln(p.age) * ln(getQuantityValue(tcl[0])) +
                                    ageSmk_women * ln(p.age) * smk_status -
                                    con_women;

                            }

                            risk = (1 - Math.pow(0.98767, Math.exp(coef))) * 100;

                        } else {

                            if (p.age > 70) {

                                coef = age_men * ln(p.age) +
                                    tcl_men * ln(getQuantityValue(tcl[0])) +
                                    hdl_men * ln(getQuantityValue(hdl[0])) +
                                    sbp_men * ln(sbp) +
                                    bpTx_men * onBpMeds +
                                    smk_men * smk_status +
                                    ageTcl_men * ln(p.age) * ln(getQuantityValue(tcl[0])) +
                                    ageSmk_men * ln(70) * smk_status +
                                    age2_men * ln(p.age) * ln(p.age) -
                                    con_men;

                            } else {


                                coef = age_men * ln(p.age) +
                                    tcl_men * ln(getQuantityValue(tcl[0])) +
                                    hdl_men * ln(getQuantityValue(hdl[0])) +
                                    sbp_men * ln(sbp) +
                                    bpTx_men * onBpMeds +
                                    smk_men * smk_status +
                                    ageTcl_men * ln(p.age) * ln(getQuantityValue(tcl[0])) +
                                    ageSmk_men * ln(p.age) * smk_status +
                                    age2_men * ln(p.age) * ln(p.age) -
                                    con_men;

                            }

                            risk = (1 - Math.pow(0.9402, Math.exp(coef))) * 100;

                        }

                        p.risk = risk.toFixed(2) + '%';

                    } else {

                        p.risk = 'Unable to Determine';

                    }

                    ret.resolve(p);

                });

            } else {
                onError();
            }
        }
        FHIR.oauth2.ready(onReady, onError);
        return ret.promise();
    };

    // Default patient parameters
    function defaultPatient() {

        return {
            fname: { value: '' },
            lname: { value: '' },
            gender: { value: '' },
            birthdate: { value: '' },
            age: { value: '' },
            sbp: { value: '' },
            dbp: { value: '' },
            ldl: { value: '' },
            hdl: { value: '' },
            tcl: { value: '' },
            smk: { value: '' },
            tgl: { value: '' },
            meds: { value: '' },
            risk: { value: '' },
        };
    }

    // Shorter natural log
    function ln(num) {
        return Math.log(num);
    }

    // Get all RxNorm CUIs (Concept Unique Identifier) from each medication object
    function getRxCuis(medications) {
                
        var rxCuis = [];

        for (i = 0; i < Object.keys(medications).length; i++) {
            var code = medications[i].medicationCodeableConcept.coding[0].code
            rxCuis.push(code);
        }                
        return rxCuis;
    }

    // Get blood pressure observation; split into diastolic & systolic
    function getBloodPressureValueAndUnit(BPObservations, typeOfPressure) {
        var formattedBPObservations = [];
        BPObservations.forEach(function (observation) {
            var BP = observation.component.find(function (component) {
                return component.code.coding.find(function (coding) {
                    return coding.code == typeOfPressure;
                });
            });

            if (BP) {
                observation.valueQuantity = BP.valueQuantity;
                formattedBPObservations.push(observation);
            }
        });
        return getQuantityValueAndUnit(formattedBPObservations[0]);
    }

    // Get only the blood pressure numerical value
    function getBloodPressureValue(BPObservations, typeOfPressure) {
        var formattedBPObservations = [];
        BPObservations.forEach(function (observation) {
            var BP = observation.component.find(function (component) {
                return component.code.coding.find(function (coding) {
                    return coding.code == typeOfPressure;
                });
            });

            if (BP) {
                observation.valueQuantity = BP.valueQuantity;
                formattedBPObservations.push(observation);
            }
        });
        return getQuantityValue(formattedBPObservations[0]);
    }

    // Get numerical value and unit of observations 
    function getQuantityValueAndUnit(ob) {

        if (typeof ob != 'undefined' &&
            typeof ob.valueQuantity != 'undefined' &&
            typeof ob.valueQuantity.value != 'undefined' &&
            typeof ob.valueQuantity.unit != 'undefined') {

            return ob.valueQuantity.value + ' ' + ob.valueQuantity.unit;

        } else {
            return undefined;
        }
    }

    // Get only numerical value of observations
    function getQuantityValue(ob) {

        if (typeof ob != 'undefined' &&
            typeof ob.valueQuantity != 'undefined' &&
            typeof ob.valueQuantity.value != 'undefined') {

            return ob.valueQuantity.value;

        } else {
            return undefined;
        }
    }

    // Calculate patient age based on birthdate
    function getAge(dateString) { // birthday is a string

        var today = new Date();
        var birthDate = new Date(dateString);
        var age = today.getFullYear() - birthDate.getFullYear();
        var m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    }

    // Get smoking status
    function getSmokingStatus(ob) {
        if (typeof ob != 'undefined' &&
            typeof ob.valueCodeableConcept != 'undefined' &&
            typeof ob.valueCodeableConcept.coding != 'undefined' &&
            typeof ob.valueCodeableConcept.coding[0].display != 'undefined') {

            return ob.valueCodeableConcept.coding[0].display;

        } else {
            return undefined;
        }
    }

    // HTTP get request and format return as JSON object
    function httpGet(theUrl) {
        var xmlHttp = new XMLHttpRequest();
        xmlHttp.open("GET", theUrl, false); // false for synchronous request
        xmlHttp.send(null);

        return JSON.parse(xmlHttp.responseText);
    }

    // Draw, show, or hide corresponding HTML on index page
    window.drawVisualization = function (p) {
        $('#holder').show();
        $('#loading').hide();
        $('#fname').html(p.fname);
        $('#lname').html(p.lname);
        $('#gender').html(p.gender);
        $('#birthdate').html(p.birthdate);
        $('#age').html(p.age);
        $('#sbp').html(p.sbp);
        $('#dbp').html(p.dbp);
        $('#ldl').html(p.ldl);
        $('#hdl').html(p.hdl);
        $('#tcl').html(p.tcl);
        $('#smk').html(p.smk);
        $('#tgl').html(p.tgl);
        $('#meds').html(p.meds);
        $('#risk').html(p.risk);
  };

})(window);
