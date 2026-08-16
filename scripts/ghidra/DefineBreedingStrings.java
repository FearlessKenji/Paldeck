// Define breeding-related ASCII strings so Ghidra can recover reflected-property references.
// @category Paldeck

import java.nio.charset.StandardCharsets;

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.mem.Memory;

public class DefineBreedingStrings extends GhidraScript {
	private static final String[] TERMS = {
		"Combi_MutationRate",
		"Combi_MutationRankCoefficient",
		"Combi_MutationRankDiffPenalty",
		"Combi_MutationRandomCoefficient",
		"Combi_MutationMinTalent",
		"Combi_MutationInitialRank",
		"bIsMutationPalEgg",
		"MutationRateBonusPercent",
		"CombiRank",
	};

	@Override
	public void run() throws Exception {
		Memory memory = currentProgram.getMemory();
		Address start = currentProgram.getMinAddress();
		for (String term : TERMS) {
			Address address = memory.findBytes(start, term.getBytes(StandardCharsets.US_ASCII), null, true, monitor);
			while (address != null) {
				if (getDataAt(address) == null) {
					createAsciiString(address);
				}
				address = memory.findBytes(address.add(term.length()), term.getBytes(StandardCharsets.US_ASCII), null, true, monitor);
			}
		}
	}
}
