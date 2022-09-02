import express from 'express'
import {Liquid} from 'liquidjs'
import fileUpload from 'express-fileupload'
import {readFile, existsSync} from 'fs'
import * as dotenv from 'dotenv'
dotenv.config()

const LOG_PATH = "./chat.log"

const loadLog = (logPath) => {
  readFile(logPath, 'utf8', function (err,data) {
    if (err) {
      console.log(err)
      return false
    }
    rawLog = data
  })
  return true
}

let HAVE_LOG = existsSync(LOG_PATH)?loadLog(LOG_PATH):false
const port = process.env.PORT

let MIN_DATE = '7/26/2022, 11:59:01 AM'
const MELEE_ATTACK_SELECTOR = '<h4 class="action">Melee Strike'
const RANGED_ATTACK_SELECTOR = '<h4 class="action">Ranged Strike'
const SKILL_SELECTOR = '<h4 class="action">Skill Check'
const REFLEX_SAVE_SELECTOR = '<h4 class="action">Reflex Saving Throw'
const FORTITUDE_SAVE_SELECTOR = '<h4 class="action">Reflex Saving Throw'
const WILL_SAVE_SELECTOR = '<h4 class="action">Reflex Saving Throw'
const DAMAGE_SELECTOR = '<strong>Damage Roll'


const RELEVANT_ACTORS = ['Groaa','Blut','Twilight','Thorondor', 'DM']

let rawLog = ""
let parsedJSON = {}


const constructSummaryTable = (canvasId, charNames, rollAverages) => {
  const goodCharNames = charNames.map(d => `'${d}'`).join(',');
  return `<script>const ctx${canvasId}=document.getElementById('${canvasId}');const myChart${canvasId}=new Chart(ctx${canvasId},{type:'bar',data:{labels:[${goodCharNames}],datasets:[{label:'Roll Average',data:[${rollAverages}],backgroundColor:['rgba(255, 99, 132, 0.2)','rgba(54, 162, 235, 0.2)','rgba(255, 206, 86, 0.2)','rgba(75, 192, 192, 0.2)','rgba(153, 102, 255, 0.2)','rgba(255, 159, 64, 0.2)'],borderColor:['rgba(255, 99, 132, 1)','rgba(54, 162, 235, 1)','rgba(255, 206, 86, 1)','rgba(75, 192, 192, 1)','rgba(153, 102, 255, 1)','rgba(255, 159, 64, 1)'],borderWidth:1}]},options:{responsive:!0,base:0,plugins:{legend:{position:'top',},title:{display:!0,text:'Average for all players'}}}})</script>`
}

// rollCount = {n} for n = 20 (# of times each d20 face appeared for a given player)
const constructDetailedAttackTable = (canvasId, charName, rollCount) => {
  let sum = 0
  let count = 0
  let avg = 0
  for(let i = 1; i <= parsedJSON[charName]['d20'].length; i++){
    count += parsedJSON[charName]['d20'][i-1]
    sum += parsedJSON[charName]['d20'][i-1] * i
  }
  avg = sum/count
  return `<script>const ctx${canvasId}=document.getElementById('${canvasId}');const myChart${canvasId}=new Chart(ctx${canvasId},{type:'bar',data:{labels:['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20'],datasets:[{label:'Times ${charName} rolled',data:[${rollCount}],backgroundColor:['rgba(255, 99, 132, 0.2)','rgba(54, 162, 235, 0.2)','rgba(255, 206, 86, 0.2)','rgba(75, 192, 192, 0.2)','rgba(153, 102, 255, 0.2)','rgba(255, 159, 64, 0.2)'],borderColor:['rgba(255, 99, 132, 1)','rgba(54, 162, 235, 1)','rgba(255, 206, 86, 1)','rgba(75, 192, 192, 1)','rgba(153, 102, 255, 1)','rgba(255, 159, 64, 1)'],borderWidth:1}]},options:{responsive:!0,plugins:{legend:{position:'top',},title:{display:!0,text:'Detailed rolls for ${charName} (${rollCount.reduce((partialSum, a) => partialSum + a, 0)} rolls, Avg: ${avg.toFixed(3)})'}}}})</script>`
}

const parseLog = (logData, attackCheckbox, saveCheckbox, skillCheckbox) => {
  if(logData === "")
    return

  const allEvents = logData.split('---------------------------')

  // Initialize JSON
  allEvents.forEach(event => {
    const allLinesInEvent = event.split('\n')
    // Create a JSON entry for all relevant actors in log, everything else is DM
    const actorNameWithInitialSpace = allLinesInEvent.at(1).split(']')[1]
    if(actorNameWithInitialSpace){
      const actorName = actorNameWithInitialSpace.substring(1)
      if(RELEVANT_ACTORS.includes(actorName)){
        parsedJSON[actorName] = {d20: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], damage:[]}
      }
      parsedJSON['DM'] = {d20: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], damage:[]}
    }
  })

  // Populate JSON
  allEvents.forEach(event => {
    const allLinesInEvent = event.split('\n')
    if(allLinesInEvent.at(1).split(']').at(1)){
      // Ignore entries that happened before MIN_DATE
      if(Date.parse(allLinesInEvent.at(1).split(']').at(0).substring(1)) > Date.parse(MIN_DATE)){
        // Get all the d20s for attacks
        if((event.includes(MELEE_ATTACK_SELECTOR) || event.includes(RANGED_ATTACK_SELECTOR)) && attackCheckbox === 'true'){
          const actorNameWithInitialSpace = allLinesInEvent.at(1).split(']')[1]
          // Check if we are in a valid actor
          if(actorNameWithInitialSpace){
            const actorName = actorNameWithInitialSpace.substring(1)
            const d20 = allLinesInEvent.at(-2).split('=')[1].split('+')[0]
            if(RELEVANT_ACTORS.includes(actorName)){
              parsedJSON[actorName]['d20'][d20-1] = parsedJSON[actorName]['d20'][d20-1]+1
            }
            else{
              parsedJSON['DM']['d20'][d20-1] = parsedJSON['DM']['d20'][d20-1]+1
            }
          }
        }
        // Get all the d20s for saves
        if((event.includes(REFLEX_SAVE_SELECTOR) || event.includes(WILL_SAVE_SELECTOR) || event.includes(FORTITUDE_SAVE_SELECTOR)) && saveCheckbox === 'true'){
          const actorNameWithInitialSpace = allLinesInEvent.at(1).split(']')[1]
          // Check if we are in a valid actor
          if(actorNameWithInitialSpace){
            const actorName = actorNameWithInitialSpace.substring(1)
            const d20 = allLinesInEvent.at(-2).split('=')[1].split('+')[0]
            if(RELEVANT_ACTORS.includes(actorName)){
              parsedJSON[actorName]['d20'][d20-1] = parsedJSON[actorName]['d20'][d20-1]+1
            }
            else{
              parsedJSON['DM']['d20'][d20-1] = parsedJSON['DM']['d20'][d20-1]+1
            }
          }
        }
        // Get all the d20s for skill checks
        if(event.includes(SKILL_SELECTOR) && skillCheckbox === 'true'){
          const actorNameWithInitialSpace = allLinesInEvent.at(1).split(']')[1]
          // Check if we are in a valid actor
          if(actorNameWithInitialSpace){
            const actorName = actorNameWithInitialSpace.substring(1)
            const d20 = allLinesInEvent.at(-2).split('=')[1].split('+')[0]
            if(RELEVANT_ACTORS.includes(actorName)){
              parsedJSON[actorName]['d20'][d20-1] = parsedJSON[actorName]['d20'][d20-1]+1
            }
            else{
              parsedJSON['DM']['d20'][d20-1] = parsedJSON['DM']['d20'][d20-1]+1
            }
          }
        }
      }
    }
  })
}

const createTables = (attackCheckbox, saveCheckbox, skillCheckbox) => {
  parseLog(rawLog, attackCheckbox, saveCheckbox, skillCheckbox)

  let canvasIds = [0]
  let detailedTables = []
  let rollAverages = []

  RELEVANT_ACTORS.forEach(actor => {
    canvasIds.push(actor)
    detailedTables.push(constructDetailedAttackTable(actor, actor, parsedJSON[actor]['d20']))
    let sum = 0
    let count = 0
    let avg = 0
    for(let i = 1; i <= parsedJSON[actor]['d20'].length; i++){
      count += parsedJSON[actor]['d20'][i-1]
      sum += parsedJSON[actor]['d20'][i-1] * i
    }
    avg = sum/count
    rollAverages.push(avg)
  })

  return {canvasIds: canvasIds, summaryTable: constructSummaryTable(canvasIds[0], RELEVANT_ACTORS, rollAverages), detailedTables: detailedTables}
}


const main = () => {
  const app = express()

  let engine = new Liquid({
    globals: { title: 'PF2e FoundryVTT Log Analyzer' },
  })
  
  // register liquid engine
  app.engine('liquid', engine.express()) 
  app.set('views', './views')            // specify the views directory
  app.set('view engine', 'liquid')       // set liquid to default
  app.use(fileUpload())

  app.get('/', (req, res) => {
    if(HAVE_LOG){
      if(req.query.startDate){
        MIN_DATE = req.query.startDate
      }
      res.render('index', createTables(req.query.attack, req.query.save, req.query.skill))
    }
    else{
      res.render('log_missing')
    }
  })

  app.get('/upload', (_, res) =>{
    const context = {
      server: process.env.SERVER,
      port: process.env.PORT
    }
    res.render('upload', context)
  })

  app.post('/upload', function(req, res) {
    let chatFile
  
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).send('No files were uploaded.')
    }
  
    // The name of the input field is used to retrieve the uploaded file
    chatFile = req.files.chatFile
  
    // Use the mv() method to place the file somewhere on your server
    chatFile.mv(LOG_PATH, function(err) {
      if (err)
        return res.status(500).send(err)
      loadLog(LOG_PATH)
      HAVE_LOG = true
      res.send('File uploaded! <a href="/">Back</a>')
    })
  })
  
  app.listen(port, () => {
    console.log(`Foundry log analyzer listening on port ${port}`)
  })  
}

main()
