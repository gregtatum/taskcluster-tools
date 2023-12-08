import sentencepiece as spm

s = spm.SentencePieceProcessor(model_file="enes.spm")
tokens = s.encode(
    """TASA

Yo, Juan Gallo de Andrada, escribano de Cámara del Rey nuestro señor, de los que residen en su Consejo, certifico y doy fe que, habiendo visto por los señores dél un libro intitulado El ingenioso hidalgo de la Mancha, compuesto por Miguel de Cervantes Saavedra, tasaron cada pliego del dicho libro a tres maravedís y medio; el cual tiene ochenta y tres pliegos, que al dicho precio monta el dicho libro docientos y noventa maravedís y medio, en que se ha de vender en papel; y dieron licencia para que a este precio se pueda vender, y mandaron que esta tasa se ponga al principio del dicho libro, y no se pueda vender sin ella. Y, para que dello conste, di la presente en Valladolid, a veinte días del mes de deciembre de mil y seiscientos y cuatro años.

Juan Gallo de Andrada.

TESTIMONIO DE LAS ERRATAS

Este libro no tiene cosa digna que no corresponda a su original; en testimonio de lo haber correcto, di esta fee. En el Colegio de la Madre de Dios de los Teólogos de la Universidad de Alcalá, en primero de diciembre de 1604 años.

El licenciado Francisco Murcia de la Llana.

EL REY

Por cuanto por parte de vos, Miguel de Cervantes, nos fue fecha relación que habíades compuesto un libro intitulado El ingenioso hidalgo de la Mancha, el cual os había costado mucho trabajo y era muy útil y provechoso, nos pedistes y suplicastes os mandásemos dar licencia y facultad para le poder imprimir, y previlegio por el tiempo que fuésemos servidos, o como la nuestra merced fuese; lo cual visto por los del nuestro Consejo, por cuanto en el dicho libro se hicieron las diligencias que la premática últimamente por nos fecha sobre la impresión de los libros dispone, fue acordado que debíamos mandar dar esta nuestra cédula para vos, en la dicha razón; y nos tuvímoslo por bien. Por la cual, por os hacer bien y merced, os damos licencia y facultad para que vos, o la persona que vuestro poder hubiere, y no otra alguna, podáis imprimir el dicho libro, intitulado El ingenioso hidalgo de la Mancha, que desuso se hace mención, en todos estos nuestros reinos de Castilla, por tiempo y espacio de diez años, que corran y se cuenten desde el dicho día de la data desta nuestra cédula; so pena que la persona o personas que, sin tener vuestro poder, lo imprimiere o vendiere, o hiciere imprimir o vender, por el mesmo caso pierda la impresión que hiciere, con los moldes y aparejos della; y más, incurra en pena de cincuenta mil maravedís cada vez que lo contrario hiciere. La cual dicha pena sea la tercia parte para la persona que lo acusare, y la otra tercia parte para nuestra Cámara, y la otra tercia parte para el juez que lo sentenciare. Con tanto que todas las veces que hubiéredes de hacer imprimir el dicho libro, durante el tiempo de los dichos diez años, le traigáis al nuestro Consejo, juntamente con el original que en él fue visto, que va rubricado cada plana y firmado al fin dél de Juan Gallo de Andrada, nuestro Escribano de Cámara, de los que en él residen, para saber si la dicha impresión está conforme el original; o traigáis fe en pública forma de cómo por corretor nombrado por nuestro mandado, se vio y corrigió la dicha impresión por el original, y se imprimió conforme a él, y quedan impresas las erratas por él apuntadas, para cada un libro de los que así fueren impresos, para que se tase el precio que por cada volume hubiéredes de haber. Y mandamos al impresor que así imprimiere el dicho libro, no imprima el principio ni el primer pliego dél, ni entregue más de un solo libro con el original al autor, o persona a cuya costa lo imprimiere, ni otro alguno, para efeto de la dicha correción y tasa, hasta que antes y primero el dicho libro esté corregido y tasado por los del nuestro Consejo; y, estando hecho, y no de otra manera, pueda imprimir el dicho principio y primer pliego, y sucesivamente ponga esta nuestra cédula y la aprobación, tasa y erratas, so pena de caer e incurrir en las penas contenidas en las leyes y premáticas destos nuestros reinos. Y mandamos a los del nuestro Consejo, y a otras cualesquier justicias dellos, guarden y cumplan esta nuestra cédula y lo en ella contenido. Fecha en Valladolid, a veinte y seis días del mes de setiembre de mil y seiscientos y cuatro años.

YO, EL REY.

Por mandado del Rey nuestro señor:

Juan de Amezqueta.

AL DUQUE DE BÉJAR,

marqués de Gibraleón, conde de Benalcázar y Bañares, vizconde de La Puebla de Alcocer, señor de las villas de Capilla, Curiel y Burguillos

En fe del buen acogimiento y honra que hace Vuestra Excelencia a toda suerte de libros, como príncipe tan inclinado a favorecer las buenas artes, mayormente las que por su nobleza no se abaten al servicio y granjerías del vulgo, he determinado de sacar a luz al Ingenioso hidalgo don Quijote de la Mancha, al abrigo del clarísimo nombre de Vuestra Excelencia, a quien, con el acatamiento que debo a tanta grandeza, suplico le reciba agradablemente en su protección, para que a su sombra, aunque desnudo de aquel precioso ornamento de elegancia y erudición de que suelen andar vestidas las obras que se componen en las casas de los hombres que saben, ose parecer seguramente en el juicio de algunos que, continiéndose en los límites de su ignorancia, suelen condenar con más rigor y menos justicia los trabajos ajenos; que, poniendo los ojos la prudencia de Vuestra Excelencia en mi buen deseo, fío que no desdeñará la cortedad de tan humilde servicio.

Miguel de Cervantes Saavedra.

PRÓLOGO

Desocupado lector: sin juramento me podrás creer que quisiera que este libro, como hijo del entendimiento, fuera el más hermoso, el más gallardo y más discreto que pudiera imaginarse. Pero no he podido yo contravenir al orden de naturaleza; que en ella cada cosa engendra su semejante. Y así, ¿qué podrá engendrar el estéril y mal cultivado ingenio mío, sino la historia de un hijo seco, avellanado, antojadizo y lleno de pensamientos varios y nunca imaginados de otro alguno, bien como quien se engendró en una cárcel, donde toda incomodidad tiene su asiento y donde todo triste ruido hace su habitación? El sosiego, el lugar apacible, la amenidad de los campos, la serenidad de los cielos, el murmurar de las fuentes, la quietud del espíritu son grande parte para que las musas más estériles se muestren fecundas y ofrezcan partos al mundo que le colmen de maravilla y de contento. Acontece tener un padre un hijo feo y sin gracia alguna, y el amor que le tiene le pone una venda en los ojos para que no vea sus faltas, antes las juzga por discreciones y lindezas y las cuenta a sus amigos por agudezas y donaires. Pero yo, que, aunque parezco padre, soy padrastro de Don Quijote, no quiero irme con la corriente del uso, ni suplicarte, casi con las lágrimas en los ojos, como otros hacen, lector carísimo, que perdones o disimules las faltas que en este mi hijo vieres; y ni eres su pariente ni su amigo, y tienes tu alma en tu cuerpo y tu libre albedrío como el más pintado, y estás en tu casa, donde eres señor della, como el rey de sus alcabalas, y sabes lo que comúnmente se dice: que debajo de mi manto, al rey mato. Todo lo cual te esenta y hace libre de todo respecto y obligación; y así, puedes decir de la historia todo aquello que te pareciere, sin temor que te calunien por el mal ni te premien por el bien que dijeres della.

Sólo quisiera dártela monda y desnuda, sin el ornato de prólogo, ni de la inumerabilidad y catálogo de los acostumbrados sonetos, epigramas y elogios que al principio de los libros suelen ponerse. Porque te sé decir que, aunque me costó algún trabajo componerla, ninguno tuve por mayor que hacer esta prefación que vas leyendo. Muchas veces tomé la pluma para escribille, y muchas la dejé, por no saber lo que escribiría; y, estando una suspenso, con el papel delante, la pluma en la oreja, el codo en el bufete y la mano en la mejilla, pensando lo que diría, entró a deshora un amigo mío, gracioso y bien entendido, el cual, viéndome tan imaginativo, me preguntó la causa; y, no encubriéndosela yo, le dije que pensaba en el prólogo que había de hacer a la historia de don Quijote, y que me tenía de suerte que ni quería hacerle, ni menos sacar a luz las hazañas de tan noble caballero.

— Porque, ¿cómo queréis vos que no me tenga confuso el qué dirá el antiguo legislador que llaman vulgo cuando vea que, al cabo de tantos años como ha que duermo en el silencio del olvido, salgo ahora, con todos mis años a cuestas, con una leyenda seca como un esparto, ajena de invención, menguada de estilo, pobre de concetos y falta de toda erudición y doctrina; sin acotaciones en las márgenes y sin anotaciones en el fin del libro, como veo que están otros libros, aunque sean fabulosos y profanos, tan llenos de sentencias de Aristóteles, de Platón y de toda la caterva de filósofos, que admiran a los leyentes y tienen a sus autores por hombres leídos, eruditos y elocuentes? ¡Pues qué, cuando citan la Divina Escritura! No dirán sino que son unos santos Tomases y otros doctores de la Iglesia; guardando en esto un decoro tan ingenioso, que en un renglón han pintado un enamorado destraído y en otro hacen un sermoncico cristiano, que es un contento y un regalo oílle o leelle. De todo esto ha de carecer mi libro, porque ni tengo qué acotar en el margen, ni qué anotar en el fin, ni menos sé qué autores sigo en él, para ponerlos al principio, como hacen todos, por las letras del A.B.C., comenzando en Aristóteles y acabando en Xenofonte y en Zoílo o Zeuxis, aunque fue maldiciente el uno y pintor el otro. También ha de carecer mi libro de sonetos al principio, a lo menos de sonetos cuyos autores sean duques, marqueses, condes, obispos, damas o poetas celebérrimos; aunque, si yo los pidiese a dos o tres oficiales amigos, yo sé que me los darían, y tales, que no les igualasen los de aquellos que tienen más nombre en nuestra España. En fin, señor y amigo mío —proseguí—, yo determino que el señor don Quijote se quede sepultado en sus archivos en la Mancha, hasta que el cielo depare quien le adorne de tantas cosas como le faltan; porque yo me hallo incapaz de remediarlas, por mi insuficiencia y pocas letras, y porque naturalmente soy poltrón y perezoso de andarme buscando autores que digan lo que yo me sé decir sin ellos. De aquí nace la suspensión y elevamiento, amigo, en que me hallastes; bastante causa para ponerme en ella la que de mí habéis oído.

Oyendo lo cual mi amigo, dándose una palmada en la frente y disparando en una carga de risa, me dijo:

— Por Dios, hermano, que agora me acabo de desengañar de un engaño en que he estado todo el mucho tiempo que ha que os conozco, en el cual siempre os he tenido por discreto y prudente en todas vuestras aciones. Pero agora veo que estáis tan lejos de serlo como lo está el cielo de la tierra. ¿Cómo que es posible que cosas de tan poco momento y tan fáciles de remediar puedan tener fuerzas de suspender y absortar un ingenio tan maduro como el vuestro, y tan hecho a romper y atropellar por otras dificultades mayores? A la fe, esto no nace de falta de habilidad, sino de sobra de pereza y penuria de discurso. ¿Queréis ver si es verdad lo que digo? Pues estadme atento y veréis cómo, en un abrir y cerrar de ojos, confundo todas vuestras dificultades y remedio todas las faltas que decís que os suspenden y acobardan para dejar de sacar a la luz del mundo la historia de vuestro famoso don Quijote, luz y espejo de toda la caballería andante.

— Decid —le repliqué yo, oyendo lo que me decía—: ¿de qué modo pensáis llenar el vacío de mi temor y reducir a claridad el caos de mi confusión?

A lo cual él dijo:

— Lo primero en que reparáis de los sonetos, epigramas o elogios que os faltan para el principio, y que sean de personajes graves y de título, se puede remediar en que vos mesmo toméis algún trabajo en hacerlos, y después los podéis bautizar y poner el nombre que quisiéredes, ahijándolos al Preste Juan de las Indias o al Emperador de Trapisonda, de quien yo sé que hay noticia que fueron famosos poetas; y cuando no lo hayan sido y hubiere algunos pedantes y bachilleres que por detrás os muerdan y murmuren desta verdad, no se os dé dos maravedís; porque, ya que os averigüen la mentira, no os han de cortar la mano con que lo escribistes.

»En lo de citar en las márgenes los libros y autores de donde sacáredes las sentencias y dichos que pusiéredes en vuestra historia, no hay más sino hacer, de manera que venga a pelo, algunas sentencias o latines que vos sepáis de memoria, o, a lo menos, que os cuesten poco trabajo el buscalle; como será poner, tratando de libertad y cautiverio:

Non bene pro toto libertas venditur auro.

Y luego, en el margen, citar a Horacio, o a quien lo dijo. Si tratáredes del poder de la muerte, acudir luego con:

Pallida mors aequo pulsat pede pauperum tabernas,
Regumque turres.

Si de la amistad y amor que Dios manda que se tenga al enemigo, entraros luego al punto por la Escritura Divina, que lo podéis hacer con tantico de curiosidad, y decir las palabras, por lo menos, del mismo Dios: Ego autem dico vobis: diligite inimicos vestros. Si tratáredes de malos pensamientos, acudid con el Evangelio: De corde exeunt cogitationes malae. Si de la instabilidad de los amigos, ahí está Catón, que os dará su dístico:

Donec eris felix, multos numerabis amicos,
tempora si fuerint nubila, solus eris.

Y con estos latinicos y otros tales os tendrán siquiera por gramático, que el serlo no es de poca honra y provecho el día de hoy.

»En lo que toca el poner anotaciones al fin del libro, seguramente lo podéis hacer desta manera: si nombráis algún gigante en vuestro libro, hacelde que sea el gigante Golías, y con sólo esto, que os costará casi nada, tenéis una grande anotación, pues podéis poner: El gigante Golías, o Goliat, fue un filisteo a quien el pastor David mató de una gran pedrada en el valle de Terebinto, según se cuenta en el Libro de los Reyes, en el capítulo que vos halláredes que se escribe. Tras esto, para mostraros hombre erudito en letras humanas y cosmógrafo, haced de modo como en vuestra historia se nombre el río Tajo, y veréisos luego con otra famosa anotación, poniendo: El río Tajo fue así dicho por un rey de las Españas; tiene su nacimiento en tal lugar y muere en el mar océano, besando los muros de la famosa ciudad de Lisboa; y es opinión que tiene las arenas de oro, etc. Si tratáredes de ladrones, yo os diré la historia de Caco, que la sé de coro; si de mujeres rameras, ahí está el obispo de Mondoñedo, que os prestará a Lamia, Laida y Flora, cuya anotación os dará gran crédito; si de crueles, Ovidio os entregará a Medea; si de encantadores y hechiceras, Homero tiene a Calipso, y Virgilio a Circe; si de capitanes valerosos, el mesmo Julio César os prestará a sí mismo en sus Comentarios, y Plutarco os dará mil Alejandros. Si tratáredes de amores, con dos onzas que sepáis de la lengua toscana, toparéis con León Hebreo, que os hincha las medidas. Y si no queréis andaros por tierras extrañas, en vuestra casa tenéis a Fonseca, Del amor de Dios, donde se cifra todo lo que vos y el más ingenioso acertare a desear en tal materia. En resolución, no hay más sino que vos procuréis nombrar estos nombres, o tocar estas historias en la vuestra, que aquí he dicho, y dejadme a mí el cargo de poner las anotaciones y acotaciones; que yo os voto a tal de llenaros las márgenes y de gastar cuatro pliegos en el fin del libro.

»Vengamos ahora a la citación de los autores que los otros libros tienen, que en el vuestro os faltan. El remedio que esto tiene es muy fácil, porque no habéis de hacer otra cosa que buscar un libro que los acote todos, desde la A hasta la Z, como vos decís. Pues ese mismo abecedario pondréis vos en vuestro libro; que, puesto que a la clara se vea la mentira, por la poca necesidad que vos teníades de aprovecharos dellos, no importa nada; y quizá alguno habrá tan simple, que crea que de todos os habéis aprovechado en la simple y sencilla historia vuestra; y, cuando no sirva de otra cosa, por lo menos servirá aquel largo catálogo de autores a dar de improviso autoridad al libro. Y más, que no habrá quien se ponga a averiguar si los seguistes o no los seguistes, no yéndole nada en ello. Cuanto más que, si bien caigo en la cuenta, este vuestro libro no tiene necesidad de ninguna cosa de aquellas que vos decís que le falta, porque todo él es una invectiva contra los libros de caballerías, de quien nunca se acordó Aristóteles, ni dijo nada San Basilio, ni alcanzó Cicerón; ni caen debajo de la cuenta de sus fabulosos disparates las puntualidades de la verdad, ni las observaciones de la astrología; ni le son de importancia las medidas geométricas, ni la confutación de los argumentos de quien se sirve la retórica; ni tiene para qué predicar a ninguno, mezclando lo humano con lo divino, que es un género de mezcla de quien no se ha de vestir ningún cristiano entendimiento. Sólo tiene que aprovecharse de la imitación en lo que fuere escribiendo; que, cuanto ella fuere más perfecta, tanto mejor será lo que se escribiere. Y, pues esta vuestra escritura no mira a más que a deshacer la autoridad y cabida que en el mundo y en el vulgo tienen los libros de caballerías, no hay para qué andéis mendigando sentencias de filósofos, consejos de la Divina Escritura, fábulas de poetas, oraciones de retóricos, milagros de santos, sino procurar que a la llana, con palabras significantes, honestas y bien colocadas, salga vuestra oración y período sonoro y festivo; pintando, en todo lo que alcanzáredes y fuere posible, vuestra intención, dando a entender vuestros conceptos sin intricarlos y escurecerlos. Procurad también que, leyendo vuestra historia, el melancólico se mueva a risa, el risueño la acreciente, el simple no se enfade, el discreto se admire de la invención, el grave no la desprecie, ni el prudente deje de alabarla. En efecto, llevad la mira puesta a derribar la máquina mal fundada destos caballerescos libros, aborrecidos de tantos y alabados de muchos más; que si esto alcanzásedes, no habríades alcanzado poco.

Con silencio grande estuve escuchando lo que mi amigo me decía, y de tal manera se imprimieron en mí sus razones que, sin ponerlas en disputa, las aprobé por buenas y de ellas mismas quise hacer este prólogo; en el cual verás, lector suave, la discreción de mi amigo, la buena ventura mía en hallar en tiempo tan necesitado tal consejero, y el alivio tuyo en hallar tan sincera y tan sin revueltas la historia del famoso don Quijote de la Mancha, de quien hay opinión, por todos los habitadores del distrito del campo de Montiel, que fue el más casto enamorado y el más valiente caballero que de muchos años a esta parte se vio en aquellos contornos. Yo no quiero encarecerte el servicio que te hago en darte a conocer tan noble y tan honrado caballero, pero quiero que me agradezcas el conocimiento que tendrás del famoso Sancho Panza, su escudero, en quien, a mi parecer, te doy cifradas todas las gracias escuderiles que en la caterva de los libros vanos de caballerías están esparcidas.

Y con esto, Dios te dé salud, y a mí no olvide. Vale.

AL LIBRO DE DON QUIJOTE DE LA MANCHA

Urganda la desconocida
Si de llegarte a los bue-,
libro, fueres con letu-,
no te dirá el boquirru-
que no pones bien los de-.
Mas si el pan no se te cue-
por ir a manos de idio-,
verás de manos a bo-,
aun no dar una en el cla-,
si bien se comen las ma-
por mostrar que son curio-.
Y, pues la expiriencia ense-
que el que a buen árbol se arri-
buena sombra le cobi-,
en Béjar tu buena estre-
un árbol real te ofre-
que da príncipes por fru-,
en el cual floreció un du-
que es nuevo Alejandro Ma-:
llega a su sombra, que a osa-
favorece la fortu-.
De un noble hidalgo manche-
contarás las aventu-,
a quien ociosas letu-,
trastornaron la cabe-:
damas, armas, caballe-,
le provocaron de mo-,
que, cual Orlando furio-,
templado a lo enamora-,
alcanzó a fuerza de bra-
a Dulcinea del Tobo-.
No indiscretos hieroglí-
estampes en el escu-,
que, cuando es todo figu-,
con ruines puntos se envi-.
Si en la dirección te humi-,

no dirá, mofante, algu-:
''¡Qué don Álvaro de Lu-,
qué Anibal el de Carta-,
qué rey Francisco en Espa-
se queja de la Fortu-!''
Pues al cielo no le plu-
que salieses tan ladi-
como el negro Juan Lati-,
hablar latines rehú-.
No me despuntes de agu-,
ni me alegues con filó-,
porque, torciendo la bo-,
dirá el que entiende la le-,
no un palmo de las ore-:
''¿Para qué conmigo flo-?''
No te metas en dibu-,
ni en saber vidas aje-,
que, en lo que no va ni vie-,

pasar de largo es cordu-.
Que suelen en caperu-
darles a los que grace-;
mas tú quémate las ce-
sólo en cobrar buena fa-;
que el que imprime neceda-
dalas a censo perpe-.
Advierte que es desati-,
siendo de vidrio el teja-,
tomar piedras en las ma-
para tirar al veci-.
Deja que el hombre de jui-,
en las obras que compo-,
se vaya con pies de plo-;
que el que saca a luz pape-
para entretener donce-
escribe a tontas y a lo-.

AMADÍS DE GAULA A DON QUIJOTE DE LA MANCHA

Soneto

Tú, que imitaste la llorosa vida
que tuve, ausente y desdeñado sobre
el gran ribazo de la Peña Pobre,
de alegre a penitencia reducida;
tú, a quien los ojos dieron la bebida
de abundante licor, aunque salobre,
y alzándote la plata, estaño y cobre,
te dio la tierra en tierra la comida,
vive seguro de que eternamente,
en tanto, al menos, que en la cuarta esfera,
sus caballos aguije el rubio Apolo,
tendrás claro renombre de valiente;
tu patria será en todas la primera;
tu sabio autor, al mundo único y solo.

DON BELIANÍS DE GRECIA A DON QUIJOTE DE LA MANCHA

Soneto

Rompí, corté, abollé, y dije y hice
más que en el orbe caballero andante;
fui diestro, fui valiente, fui arrogante;
mil agravios vengué, cien mil deshice.
Hazañas di a la Fama que eternice;
fui comedido y regalado amante;
fue enano para mí todo gigante,
y al duelo en cualquier punto satisfice.
Tuve a mis pies postrada la Fortuna,
y trajo del copete mi cordura
a la calva Ocasión al estricote.
Más, aunque sobre el cuerno de la luna
siempre se vio encumbrada mi ventura,
tus proezas envidio, ¡oh gran Quijote!

LA SEÑORA ORIANA A DULCINEA DEL TOBOSO

Soneto

¡Oh, quién tuviera, hermosa Dulcinea,
por más comodidad y más reposo,
a Miraflores puesto en el Toboso,
y trocara sus Londres con tu aldea!
¡Oh, quién de tus deseos y librea
alma y cuerpo adornara, y del famoso
caballero que hiciste venturoso
mirara alguna desigual pelea!
¡Oh, quién tan castamente se escapara
del señor Amadís como tú hiciste
del comedido hidalgo don Quijote!
Que así envidiada fuera, y no envidiara,
y fuera alegre el tiempo que fue triste,
y gozara los gustos sin escote.

GANDALÍN, ESCUDERO DE AMADÍS DE GAULA, A SANCHO PANZA, ESCUDERO DE DON QUIJOTE

Soneto

Salve, varón famoso, a quien Fortuna,
cuando en el trato escuderil te puso,
tan blanda y cuerdamente lo dispuso,
que lo pasaste sin desgracia alguna.
Ya la azada o la hoz poco repugna
al andante ejercicio; ya está en uso
la llaneza escudera, con que acuso
al soberbio que intenta hollar la luna.
Envidio a tu jumento y a tu nombre,
y a tus alforjas igualmente invidio,
que mostraron tu cuerda providencia.
Salve otra vez, ¡oh Sancho!, tan buen hombre,
que a solo tú nuestro español Ovidio
con buzcorona te hace reverencia.

DEL DONOSO, POETA ENTREVERADO, A SANCHO PANZA Y ROCINANTE

Soy Sancho Panza, escude-
del manchego don Quijo-.
Puse pies en polvoro-,
por vivir a lo discre-;
que el tácito Villadie-
toda su razón de esta-
cifró en una retira-,
según siente Celesti-,
libro, en mi opinión, divi-
si encubriera más lo huma-.
A Rocinante
Soy Rocinante, el famo-
bisnieto del gran Babie-.
Por pecados de flaque-,
fui a poder de un don Quijo-.
Parejas corrí a lo flo-;
mas, por uña de caba-,
no se me escapó ceba-;
que esto saqué a Lazari-
cuando, para hurtar el vi-
al ciego, le di la pa-.

ORLANDO FURIOSO A DON QUIJOTE DE LA MANCHA

Soneto

Si no eres par, tampoco le has tenido:
que par pudieras ser entre mil pares;
ni puede haberle donde tú te hallares,
invito vencedor, jamás vencido.
Orlando soy, Quijote, que, perdido
por Angélica, vi remotos mares,
ofreciendo a la Fama en sus altares
aquel valor que respetó el olvido.
No puedo ser tu igual; que este decoro
se debe a tus proezas y a tu fama,
puesto que, como yo, perdiste el seso.
Mas serlo has mío, si al soberbio moro
y cita fiero domas, que hoy nos llama
iguales en amor con mal suceso.

EL CABALLERO DEL FEBO A DON QUIJOTE DE LA MANCHA

Soneto

A vuestra espada no igualó la mía,
Febo español, curioso cortesano,
ni a la alta gloria de valor mi mano,
que rayo fue do nace y muere el día.
Imperios desprecié; la monarquía
que me ofreció el Oriente rojo en vano
dejé, por ver el rostro soberano
de Claridiana, aurora hermosa mía.
Améla por milagro único y raro,
y, ausente en su desgracia, el propio infierno
temió mi brazo, que domó su rabia.
Mas vos, godo Quijote, ilustre y claro,
por Dulcinea sois al mundo eterno,
y ella, por vos, famosa, honesta y sabia.

DE SOLISDÁN A DON QUIJOTE DE LA MANCHA

Soneto

Maguer, señor Quijote, que sandeces
vos tengan el cerbelo derrumbado,
nunca seréis de alguno reprochado
por home de obras viles y soeces.
Serán vuesas fazañas los joeces,
pues tuertos desfaciendo habéis andado,
siendo vegadas mil apaleado
por follones cautivos y raheces.
Y si la vuesa linda Dulcinea
desaguisado contra vos comete,
ni a vuesas cuitas muestra buen talante,
en tal desmán, vueso conorte sea
que Sancho Panza fue mal alcagüete,
necio él, dura ella, y vos no amante.

DIÁLOGO ENTRE BABIECA Y ROCINANTE

Soneto

B. ¿Cómo estáis, Rocinante, tan delgado?
R. Porque nunca se come, y se trabaja.
B. Pues, ¿qué es de la cebada y de la paja?
R. No me deja mi amo ni un bocado.
B. Andá, señor, que estáis muy mal criado,
pues vuestra lengua de asno al amo ultraja.
R. Asno se es de la cuna a la mortaja.
¿Queréislo ver? Miraldo enamorado.
B. ¿Es necedad amar? R. No es gran prudencia.
B. Metafísico estáis. R. Es que no como.
B. Quejaos del escudero. R. No es bastante.
¿Cómo me he de quejar en mi dolencia,
si el amo y escudero o mayordomo
son tan rocines como Rocinante?

Primera parte del ingenioso hidalgo don Quijote de la Mancha

Capítulo primero. Que trata de la condición y ejercicio del famoso hidalgo don Quijote de la Mancha

En un lugar de la Mancha, de cuyo nombre no quiero acordarme, no ha mucho tiempo que vivía un hidalgo de los de lanza en astillero, adarga antigua, rocín flaco y galgo corredor. Una olla de algo más vaca que carnero, salpicón las más noches, duelos y quebrantos los sábados, lantejas los viernes, algún palomino de añadidura los domingos, consumían las tres partes de su hacienda. El resto della concluían sayo de velarte, calzas de velludo para las fiestas, con sus pantuflos de lo mesmo, y los días de entresemana se honraba con su vellorí de lo más fino. Tenía en su casa una ama que pasaba de los cuarenta, y una sobrina que no llegaba a los veinte, y un mozo de campo y plaza, que así ensillaba el rocín como tomaba la podadera. Frisaba la edad de nuestro hidalgo con los cincuenta años; era de complexión recia, seco de carnes, enjuto de rostro, gran madrugador y amigo de la caza. Quieren decir que tenía el sobrenombre de Quijada, o Quesada, que en esto hay alguna diferencia en los autores que deste caso escriben; aunque, por conjeturas verosímiles, se deja entender que se llamaba Quejana. Pero esto importa poco a nuestro cuento; basta que en la narración dél no se salga un punto de la verdad.

Es, pues, de saber que este sobredicho hidalgo, los ratos que estaba ocioso, que eran los más del año, se daba a leer libros de caballerías, con tanta afición y gusto, que olvidó casi de todo punto el ejercicio de la caza, y aun la administración de su hacienda. Y llegó a tanto su curiosidad y desatino en esto, que vendió muchas hanegas de tierra de sembradura para comprar libros de caballerías en que leer, y así, llevó a su casa todos cuantos pudo haber dellos; y de todos, ningunos le parecían tan bien como los que compuso el famoso Feliciano de Silva, porque la claridad de su prosa y aquellas entricadas razones suyas le parecían de perlas, y más cuando llegaba a leer aquellos requiebros y cartas de desafíos, donde en muchas partes hallaba escrito: La razón de la sinrazón que a mi razón se hace, de tal manera mi razón enflaquece, que con razón me quejo de la vuestra fermosura. Y también cuando leía: ...los altos cielos que de vuestra divinidad divinamente con las estrellas os fortifican, y os hacen merecedora del merecimiento que merece la vuestra grandeza.

Con estas razones perdía el pobre caballero el juicio, y desvelábase por entenderlas y desentrañarles el sentido, que no se lo sacara ni las entendiera el mesmo Aristóteles, si resucitara para sólo ello. No estaba muy bien con las heridas que don Belianís daba y recebía, porque se imaginaba que, por grandes maestros que le hubiesen curado, no dejaría de tener el rostro y todo el cuerpo lleno de cicatrices y señales. Pero, con todo, alababa en su autor aquel acabar su libro con la promesa de aquella inacabable aventura, y muchas veces le vino deseo de tomar la pluma y dalle fin al pie de la letra, como allí se promete; y sin duda alguna lo hiciera, y aun saliera con ello, si otros mayores y continuos pensamientos no se lo estorbaran. Tuvo muchas veces competencia con el cura de su lugar —que era hombre docto, graduado en Sigüenza—, sobre cuál había sido mejor caballero: Palmerín de Ingalaterra o Amadís de Gaula; mas maese Nicolás, barbero del mesmo pueblo, decía que ninguno llegaba al Caballero del Febo, y que si alguno se le podía comparar, era don Galaor, hermano de Amadís de Gaula, porque tenía muy acomodada condición para todo; que no era caballero melindroso, ni tan llorón como su hermano, y que en lo de la valentía no le iba en zaga.

En resolución, él se enfrascó tanto en su letura, que se le pasaban las noches leyendo de claro en claro, y los días de turbio en turbio; y así, del poco dormir y del mucho leer, se le secó el celebro, de manera que vino a perder el juicio. Llenósele la fantasía de todo aquello que leía en los libros, así de encantamentos como de pendencias, batallas, desafíos, heridas, requiebros, amores, tormentas y disparates imposibles; y asentósele de tal modo en la imaginación que era verdad toda aquella máquina de aquellas sonadas soñadas invenciones que leía, que para él no había otra historia más cierta en el mundo. Decía él que el Cid Ruy Díaz había sido muy buen caballero, pero que no tenía que ver con el Caballero de la Ardiente Espada, que de sólo un revés había partido por medio dos fieros y descomunales gigantes. Mejor estaba con Bernardo del Carpio, porque en Roncesvalles había muerto a Roldán el encantado, valiéndose de la industria de Hércules, cuando ahogó a Anteo, el hijo de la Tierra, entre los brazos. Decía mucho bien del gigante Morgante, porque, con ser de aquella generación gigantea, que todos son soberbios y descomedidos, él solo era afable y bien criado. Pero, sobre todos, estaba bien con Reinaldos de Montalbán, y más cuando le veía salir de su castillo y robar cuantos topaba, y cuando en allende robó aquel ídolo de Mahoma que era todo de oro, según dice su historia. Diera él, por dar una mano de coces al traidor de Galalón, al ama que tenía, y aun a su sobrina de añadidura.

En efeto, rematado ya su juicio, vino a dar en el más estraño pensamiento que jamás dio loco en el mundo; y fue que le pareció convenible y necesario, así para el aumento de su honra como para el servicio de su república, hacerse caballero andante, y irse por todo el mundo con sus armas y caballo a buscar las aventuras y a ejercitarse en todo aquello que él había leído que los caballeros andantes se ejercitaban, deshaciendo todo género de agravio, y poniéndose en ocasiones y peligros donde, acabándolos, cobrase eterno nombre y fama. Imaginábase el pobre ya coronado por el valor de su brazo, por lo menos, del imperio de Trapisonda; y así, con estos tan agradables pensamientos, llevado del estraño gusto que en ellos sentía, se dio priesa a poner en efeto lo que deseaba.

Y lo primero que hizo fue limpiar unas armas que habían sido de sus bisabuelos, que, tomadas de orín y llenas de moho, luengos siglos había que estaban puestas y olvidadas en un rincón. Limpiólas y aderezólas lo mejor que pudo, pero vio que tenían una gran falta, y era que no tenían celada de encaje, sino morrión simple; mas a esto suplió su industria, porque de cartones hizo un modo de media celada, que, encajada con el morrión, hacían una apariencia de celada entera. Es verdad que para probar si era fuerte y podía estar al riesgo de una cuchillada, sacó su espada y le dio dos golpes, y con el primero y en un punto deshizo lo que había hecho en una semana; y no dejó de parecerle mal la facilidad con que la había hecho pedazos, y, por asegurarse deste peligro, la tornó a hacer de nuevo, poniéndole unas barras de hierro por de dentro, de tal manera que él quedó satisfecho de su fortaleza; y, sin querer hacer nueva experiencia della, la diputó y tuvo por celada finísima de encaje.

Fue luego a ver su rocín, y, aunque tenía más cuartos que un real y más tachas que el caballo de Gonela, que tantum pellis et ossa fuit, le pareció que ni el Bucéfalo de Alejandro ni Babieca el del Cid con él se igualaban. Cuatro días se le pasaron en imaginar qué nombre le pondría; porque, según se decía él a sí mesmo, no era razón que caballo de caballero tan famoso, y tan bueno él por sí, estuviese sin nombre conocido; y ansí, procuraba acomodársele de manera que declarase quién había sido, antes que fuese de caballero andante, y lo que era entonces; pues estaba muy puesto en razón que, mudando su señor estado, mudase él también el nombre, y le cobrase famoso y de estruendo, como convenía a la nueva orden y al nuevo ejercicio que ya profesaba. Y así, después de muchos nombres que formó, borró y quitó, añadió, deshizo y tornó a hacer en su memoria e imaginación, al fin le vino a llamar Rocinante: nombre, a su parecer, alto, sonoro y significativo de lo que había sido cuando fue rocín, antes de lo que ahora era, que era antes y primero de todos los rocines del mundo.

Puesto nombre, y tan a su gusto, a su caballo, quiso ponérsele a sí mismo, y en este pensamiento duró otros ocho días, y al cabo se vino a llamar don Quijote; de donde —como queda dicho— tomaron ocasión los autores desta tan verdadera historia que, sin duda, se debía de llamar Quijada, y no Quesada, como otros quisieron decir. Pero, acordándose que el valeroso Amadís no sólo se había contentado con llamarse Amadís a secas, sino que añadió el nombre de su reino y patria, por Hepila famosa, y se llamó Amadís de Gaula, así quiso, como buen caballero, añadir al suyo el nombre de la suya y llamarse don Quijote de la Mancha, con que, a su parecer, declaraba muy al vivo su linaje y patria, y la honraba con tomar el sobrenombre della.

Limpias, pues, sus armas, hecho del morrión celada, puesto nombre a su rocín y confirmándose a sí mismo, se dio a entender que no le faltaba otra cosa sino buscar una dama de quien enamorarse; porque el caballero andante sin amores era árbol sin hojas y sin fruto y cuerpo sin alma. Decíase él a sí:

— Si yo, por malos de mis pecados, o por mi buena suerte, me encuentro por ahí con algún gigante, como de ordinario les acontece a los caballeros andantes, y le derribo de un encuentro, o le parto por mitad del cuerpo, o, finalmente, le venzo y le rindo, ¿no será bien tener a quien enviarle presentado y que entre y se hinque de rodillas ante mi dulce señora, y diga con voz humilde y rendido: ''Yo, señora, soy el gigante Caraculiambro, señor de la ínsula Malindrania, a quien venció en singular batalla el jamás como se debe alabado caballero don Quijote de la Mancha, el cual me mandó que me presentase ante vuestra merced, para que la vuestra grandeza disponga de mí a su talante''?

¡Oh, cómo se holgó nuestro buen caballero cuando hubo hecho este discurso, y más cuando halló a quien dar nombre de su dama! Y fue, a lo que se cree, que en un lugar cerca del suyo había una moza labradora de muy buen parecer, de quien él un tiempo anduvo enamorado, aunque, según se entiende, ella jamás lo supo, ni le dio cata dello. Llamábase Aldonza Lorenzo, y a ésta le pareció ser bien darle título de señora de sus pensamientos; y, buscándole nombre que no desdijese mucho del suyo, y que tirase y se encaminase al de princesa y gran señora, vino a llamarla Dulcinea del Toboso, porque era natural del Toboso; nombre, a su parecer, músico y peregrino y significativo, como todos los demás que a él y a sus cosas había puesto.

Capítulo II. Que trata de la primera salida que de su tierra hizo el ingenioso don Quijote

Hechas, pues, estas prevenciones, no quiso aguardar más tiempo a poner en efeto su pensamiento, apretándole a ello la falta que él pensaba que hacía en el mundo su tardanza, según eran los agravios que pensaba deshacer, tuertos que enderezar, sinrazones que emendar, y abusos que mejorar y deudas que satisfacer. Y así, sin dar parte a persona alguna de su intención, y sin que nadie le viese, una mañana, antes del día, que era uno de los calurosos del mes de julio, se armó de todas sus armas, subió sobre Rocinante, puesta su mal compuesta celada, embrazó su adarga, tomó su lanza, y, por la puerta falsa de un corral, salió al campo con grandísimo contento y alborozo de ver con cuánta facilidad había dado principio a su buen deseo. Mas, apenas se vio en el campo, cuando le asaltó un pensamiento terrible, y tal, que por poco le hiciera dejar la comenzada empresa; y fue que le vino a la memoria que no era armado caballero, y que, conforme a ley de caballería, ni podía ni debía tomar armas con ningún caballero; y, puesto que lo fuera, había de llevar armas blancas, como novel caballero, sin empresa en el escudo, hasta que por su esfuerzo la ganase. Estos pensamientos le hicieron titubear en su propósito; mas, pudiendo más su locura que otra razón alguna, propuso de hacerse armar caballero del primero que topase, a imitación de otros muchos que así lo hicieron, según él había leído en los libros que tal le tenían. En lo de las armas blancas, pensaba limpiarlas de manera, en teniendo lugar, que lo fuesen más que un armiño; y con esto se quietó y prosiguió su camino, sin llevar otro que aquel que su caballo quería, creyendo que en aquello consistía la fuerza de las aventuras.

Yendo, pues, caminando nuestro flamante aventurero, iba hablando consigo mesmo y diciendo:"""
)

print(len(tokens))
