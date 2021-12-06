var MD5=function(d){return d=unescape(encodeURIComponent(d)),result=M(V(Y(X(d),8*d.length))),result.toLowerCase()};function M(d){for(var _,m="0123456789ABCDEF",f="",n=0;n<d.length;n++)_=d.charCodeAt(n),f+=m.charAt(_>>>4&15)+m.charAt(15&_);return f}function X(d){for(var _=Array(d.length>>2),m=0;m<_.length;m++)_[m]=0;for(m=0;m<8*d.length;m+=8)_[m>>5]|=(255&d.charCodeAt(m/8))<<m%32;return _}function V(d){for(var _="",m=0;m<32*d.length;m+=8)_+=String.fromCharCode(d[m>>5]>>>m%32&255);return _}function Y(d,_){d[_>>5]|=128<<_%32,d[14+(_+64>>>9<<4)]=_;for(var m=1732584193,f=-271733879,n=-1732584194,r=271733878,i=0;i<d.length;i+=16){var h=m,g=f,t=n,e=r;f=md5_ii(f=md5_ii(f=md5_ii(f=md5_ii(f=md5_hh(f=md5_hh(f=md5_hh(f=md5_hh(f=md5_gg(f=md5_gg(f=md5_gg(f=md5_gg(f=md5_ff(f=md5_ff(f=md5_ff(f=md5_ff(f,n=md5_ff(n,r=md5_ff(r,m=md5_ff(m,f,n,r,d[i+0],7,-680876936),f,n,d[i+1],12,-389564586),m,f,d[i+2],17,606105819),r,m,d[i+3],22,-1044525330),n=md5_ff(n,r=md5_ff(r,m=md5_ff(m,f,n,r,d[i+4],7,-176418897),f,n,d[i+5],12,1200080426),m,f,d[i+6],17,-1473231341),r,m,d[i+7],22,-45705983),n=md5_ff(n,r=md5_ff(r,m=md5_ff(m,f,n,r,d[i+8],7,1770035416),f,n,d[i+9],12,-1958414417),m,f,d[i+10],17,-42063),r,m,d[i+11],22,-1990404162),n=md5_ff(n,r=md5_ff(r,m=md5_ff(m,f,n,r,d[i+12],7,1804603682),f,n,d[i+13],12,-40341101),m,f,d[i+14],17,-1502002290),r,m,d[i+15],22,1236535329),n=md5_gg(n,r=md5_gg(r,m=md5_gg(m,f,n,r,d[i+1],5,-165796510),f,n,d[i+6],9,-1069501632),m,f,d[i+11],14,643717713),r,m,d[i+0],20,-373897302),n=md5_gg(n,r=md5_gg(r,m=md5_gg(m,f,n,r,d[i+5],5,-701558691),f,n,d[i+10],9,38016083),m,f,d[i+15],14,-660478335),r,m,d[i+4],20,-405537848),n=md5_gg(n,r=md5_gg(r,m=md5_gg(m,f,n,r,d[i+9],5,568446438),f,n,d[i+14],9,-1019803690),m,f,d[i+3],14,-187363961),r,m,d[i+8],20,1163531501),n=md5_gg(n,r=md5_gg(r,m=md5_gg(m,f,n,r,d[i+13],5,-1444681467),f,n,d[i+2],9,-51403784),m,f,d[i+7],14,1735328473),r,m,d[i+12],20,-1926607734),n=md5_hh(n,r=md5_hh(r,m=md5_hh(m,f,n,r,d[i+5],4,-378558),f,n,d[i+8],11,-2022574463),m,f,d[i+11],16,1839030562),r,m,d[i+14],23,-35309556),n=md5_hh(n,r=md5_hh(r,m=md5_hh(m,f,n,r,d[i+1],4,-1530992060),f,n,d[i+4],11,1272893353),m,f,d[i+7],16,-155497632),r,m,d[i+10],23,-1094730640),n=md5_hh(n,r=md5_hh(r,m=md5_hh(m,f,n,r,d[i+13],4,681279174),f,n,d[i+0],11,-358537222),m,f,d[i+3],16,-722521979),r,m,d[i+6],23,76029189),n=md5_hh(n,r=md5_hh(r,m=md5_hh(m,f,n,r,d[i+9],4,-640364487),f,n,d[i+12],11,-421815835),m,f,d[i+15],16,530742520),r,m,d[i+2],23,-995338651),n=md5_ii(n,r=md5_ii(r,m=md5_ii(m,f,n,r,d[i+0],6,-198630844),f,n,d[i+7],10,1126891415),m,f,d[i+14],15,-1416354905),r,m,d[i+5],21,-57434055),n=md5_ii(n,r=md5_ii(r,m=md5_ii(m,f,n,r,d[i+12],6,1700485571),f,n,d[i+3],10,-1894986606),m,f,d[i+10],15,-1051523),r,m,d[i+1],21,-2054922799),n=md5_ii(n,r=md5_ii(r,m=md5_ii(m,f,n,r,d[i+8],6,1873313359),f,n,d[i+15],10,-30611744),m,f,d[i+6],15,-1560198380),r,m,d[i+13],21,1309151649),n=md5_ii(n,r=md5_ii(r,m=md5_ii(m,f,n,r,d[i+4],6,-145523070),f,n,d[i+11],10,-1120210379),m,f,d[i+2],15,718787259),r,m,d[i+9],21,-343485551),m=safe_add(m,h),f=safe_add(f,g),n=safe_add(n,t),r=safe_add(r,e)}return Array(m,f,n,r)}function md5_cmn(d,_,m,f,n,r){return safe_add(bit_rol(safe_add(safe_add(_,d),safe_add(f,r)),n),m)}function md5_ff(d,_,m,f,n,r,i){return md5_cmn(_&m|~_&f,d,_,n,r,i)}function md5_gg(d,_,m,f,n,r,i){return md5_cmn(_&f|m&~f,d,_,n,r,i)}function md5_hh(d,_,m,f,n,r,i){return md5_cmn(_^m^f,d,_,n,r,i)}function md5_ii(d,_,m,f,n,r,i){return md5_cmn(m^(_|~f),d,_,n,r,i)}function safe_add(d,_){var m=(65535&d)+(65535&_);return(d>>16)+(_>>16)+(m>>16)<<16|65535&m}function bit_rol(d,_){return d<<_|d>>>32-_}
var forms = document.querySelectorAll('form[static-form]');

window.onload = function() {
    /* Fade between 3 images every 10 seconds. */
    var images = [
        'welcome-instructions-1.png',
        'welcome-instructions-2.png',
        'welcome-instructions-3.png'
    ];
    var image = document.getElementByID('welcome-instructions');
    image.src = images[0];
    document.body.appendChild(image);
    var interval = setInterval(function() {
        var imageIndex = images.indexOf(image.src);
        imageIndex = (imageIndex + 1) % images.length;
        image.src = images[imageIndex];
    }, 10000);  

    for (i = 0; i < forms.length; i++) {
        forms[i].addEventListener("submit", function (event) {
            event.preventDefault();

            var send = false,
                hashFields = [],
                fields = {},
                form = event.target,
                formData = new FormData(),
                elements = event.target.elements,
                staticFormId = event.target.getAttribute('static-form-id');

            for (i = 0; i < elements.length; i++) {
                hashFields.push(elements[i].name + elements[i].type);
                if (elements[i].type != 'submit' && elements[i].type != 'button') {
                    if (elements[i].name.length == 0) {
                        fields['field' + i] = elements[i].value;
                    } else {
                        fields[elements[i].name] = elements[i].value;
                    }
                }
            }

            for (i = 0; i < elements.length; i++) {
                if (elements[i].type != 'submit' && elements[i].type != 'button') {
                    if (elements[i].value) {
                        send = true;
                        continue;
                    }
                }
            }

            form_hash = MD5(JSON.stringify(hashFields) + window.location.hostname + staticFormId);
            formData.set('fields', JSON.stringify(fields));
            formData.set('form_name', staticFormId);
            formData.set('form_hash', form_hash);
            formData.set('domain', window.location.hostname);
            formData.set('page', window.location.pathname);
            formData.set('fullurl', window.location.href);

            if (send) {
                sendForm(formData, elements);
            }
        });
    }
}

const sendForm = async (formData, elements) => {
    const sendRequest = async (formData, elements) => {
        const url = 'https://static.app/api/forms/store'
        const result = await fetch(url, {
            method: 'POST',
            body: formData
        })

        let json = await result.json();
        if(json.status == 'success') {
            for (i=0; i < elements.length; i++){
                if(elements[i].type != 'submit' && elements[i].type != 'button') {
                    elements[i].value = '';
                } else {
                    elements[i].innerHTML = 'Done!';
                }
            }
        }
    }

    await sendRequest(formData, elements);
}

